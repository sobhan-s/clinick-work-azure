param actionGroupName string
param alertEmailAddress string
param backendAppServicePlanId string

resource actionGroup 'Microsoft.Insights/actionGroups@2024-10-01-preview' = {
  name: actionGroupName
  location: 'centralindia'
  properties: {
    groupShortName: 'DevCI-alert'
    enabled: true
    emailReceivers: [
      {
        name: 'Email DevOps Team_-EmailAction-'
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
    severity: 0
    enabled: true
    autoMitigate: true
    targetResourceType: 'Microsoft.Web/serverFarms'
    targetResourceRegion: 'centralindia'
    scopes: [
      backendAppServicePlanId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'Metric1'
          metricNamespace: 'Microsoft.Web/serverFarms'
          metricName: 'CpuPercentage'
          operator: 'GreaterThan'
          threshold: 85
          timeAggregation: 'Average'
          skipMetricValidation: false
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
