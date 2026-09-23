param location string
param appInsightsName string
param logAnalyticsWorkspaceName string
param actionGroupName string
param actionGroupEmailAddress string
param backendAppId string
param functionAppId string

// 1. Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// 2. Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// 3. Action Group (Email Alerts)
resource actionGroup 'Microsoft.Insights/actionGroups@2022-06-01' = {
  name: actionGroupName
  location: 'Global' // Action groups are always global
  properties: {
    groupShortName: 'DevOpsAlerts'
    enabled: true
    emailReceivers: [
      {
        name: 'Email DevOps Team'
        emailAddress: actionGroupEmailAddress
        useCommonAlertSchema: true
      }
    ]
  }
}

// 4. Metric Alert for Backend Web App High CPU
resource backendCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'Backend-High-CPU-Alert'
  location: 'Global'
  properties: {
    description: 'Alert when Backend CPU goes over 85%'
    severity: 1 // Warning
    enabled: true
    scopes: [
      backendAppId
    ]
    evaluationFrequency: 'PT5M' // Every 5 minutes
    windowSize: 'PT5M' // Over 5 minutes
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Metric1'
          metricNamespace: 'Microsoft.Web/sites'
          metricName: 'CpuTime' // For App Service Plan it would be CpuPercentage, but sites use CpuTime
          operator: 'GreaterThan'
          threshold: 85
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// 5. Metric Alert for Function App High CPU
resource functionCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'Functions-High-CPU-Alert'
  location: 'Global'
  properties: {
    description: 'Alert when Functions CPU goes over 85%'
    severity: 1 // Warning
    enabled: true
    scopes: [
      functionAppId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Metric1'
          metricNamespace: 'Microsoft.Web/sites'
          metricName: 'CpuTime'
          operator: 'GreaterThan'
          threshold: 85
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output appInsightsConnectionString string = appInsights.properties.ConnectionString
