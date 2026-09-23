param location string
param appServicePlanName string
param frontendAppServicePlanName string
param backendAppName string
param frontendAppName string
param appInsightsName string

resource appServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

resource frontendAppServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: frontendAppServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

resource backendApp 'Microsoft.Web/sites@2024-11-01' = {
  name: backendAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  tags: {
    apps: 'backend'
    'hidden-link: /app-insights-resource-id': resourceId('Microsoft.Insights/components', appInsightsName)
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      localMySqlEnabled: false
      netFrameworkVersion: 'v4.6'
    }
  }
}

resource frontendApp 'Microsoft.Web/sites@2024-11-01' = {
  name: frontendAppName
  location: location
  kind: 'app,linux'
  tags: {
    apps: 'frontend'
  }
  properties: {
    serverFarmId: frontendAppServicePlan.id
    siteConfig: {
      localMySqlEnabled: false
      netFrameworkVersion: 'v4.6'
    }
  }
}

output backendAppId string = backendApp.id
output frontendAppId string = frontendApp.id
output appServicePlanId string = appServicePlan.id
