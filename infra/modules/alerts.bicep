param actionGroupName string
param alertEmailAddress string
param backendAppId string
param appInsightsId string

resource actionGroup 'Microsoft.Insights/actionGroups@2024-10-01-preview' = {
  name: actionGroupName
  location: 'Global'
  properties: {
    groupShortName: 'DevCI-alert'
    enabled: true
    emailReceivers: [
      {
        name: 'Email DevOps Team'
        emailAddress: alertEmailAddress
        useCommonAlertSchema: false
      }
    ]
  }
}

resource backendCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'Backend-High-CPU-Alert'
  location: 'Global'
  properties: {
    description: 'Alert when Backend CPU goes over 85%'
    severity: 1
    enabled: true
    scopes: [
      backendAppId
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
