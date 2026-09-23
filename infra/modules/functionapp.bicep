param location string
param functionAppName string
param appServicePlanName string

resource functionAppServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: false
  }
}

resource functionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '/subscriptions/${subscription().subscriptionId}/resourceGroups/${resourceGroup().name}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${functionAppName}-uami': {}
    }
  }
  tags: {
    'hidden-link: /app-insights-resource-id': resourceId('Microsoft.Insights/components', functionAppName)
  }
  properties: {
    serverFarmId: functionAppServicePlan.id
    siteConfig: {
      localMySqlEnabled: false
      netFrameworkVersion: 'v4.6'
    }
  }
}
