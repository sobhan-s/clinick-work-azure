targetScope = 'resourceGroup'

param location string
param envName string

// Resource Names
param backendAppName string
param frontendAppName string
param functionAppName string
param appServicePlanName string
param frontendAppServicePlanName string
param functionAppServicePlanName string
param keyVaultName string
param storageAccountName string
param postgresServerName string
param logAnalyticsWorkspaceName string
param appInsightsName string
param actionGroupName string
param alertEmailAddress string
param docIntelName string

// Secrets (Passed from CI/CD, NOT stored in parameters.json)
param dbAdminUser string
@secure()
param dbAdminPassword string

// 1. Monitoring (App Insights & Log Analytics)
module monitoring 'modules/monitoring.bicep' = {
  name: 'deploy-monitoring-${envName}'
  params: {
    location: location
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    appInsightsName: appInsightsName
  }
}

// 2. Key Vault
module keyvault 'modules/keyvault.bicep' = {
  name: 'deploy-keyvault-${envName}'
  params: {
    location: location
    keyVaultName: keyVaultName
  }
}

// 3. Storage Account
module storage 'modules/storage.bicep' = {
  name: 'deploy-storage-${envName}'
  params: {
    location: location
    storageAccountName: storageAccountName
  }
}

// 4. PostgreSQL Database
module postgres 'modules/postgres.bicep' = {
  name: 'deploy-postgres-${envName}'
  params: {
    location: 'canadacentral' // Based on export data
    serverName: postgresServerName
    adminUsername: dbAdminUser
    adminPassword: dbAdminPassword
  }
}

// 5. AI Services (Document Intelligence)
module ai 'modules/ai.bicep' = {
  name: 'deploy-ai-${envName}'
  params: {
    location: location
    docIntelName: docIntelName
  }
}

// 6. Web Apps (Frontend & Backend)
module webapp 'modules/webapp.bicep' = {
  name: 'deploy-webapps-${envName}'
  params: {
    location: location
    appServicePlanName: appServicePlanName
    frontendAppServicePlanName: frontendAppServicePlanName
    backendAppName: backendAppName
    frontendAppName: frontendAppName
    appInsightsName: appInsightsName
  }
}

// 7. Azure Functions
module functionapp 'modules/functionapp.bicep' = {
  name: 'deploy-functionapp-${envName}'
  params: {
    location: location
    functionAppName: functionAppName
    appServicePlanName: functionAppServicePlanName
  }
}

// 8. Alerts & Action Groups
module alerts 'modules/alerts.bicep' = {
  name: 'deploy-alerts-${envName}'
  params: {
    actionGroupName: actionGroupName
    alertEmailAddress: alertEmailAddress
    backendAppServicePlanId: webapp.outputs.appServicePlanId
  }
}
