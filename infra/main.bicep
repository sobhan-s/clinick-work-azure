// ---------------------------------------------------------------------------
// Main Bicep Orchestrator
// This file coordinates the deployment of all modular resources in the project
// ---------------------------------------------------------------------------

@description('The Azure region where all resources will be deployed')
param location string = resourceGroup().location

@description('The environment name (e.g., dev, test, prod)')
param envName string = 'dev'

@description('The email address to receive DevOps CPU alerts')
param alertEmailAddress string

// We parameterize the existing names so Bicep adopts them without destroying them
param existingContainerRegistryName string = 'crclinicworksdevci'
param existingBackendAppName string = 'app-clinicworks-backend-${envName}'
param existingFrontendAppName string = 'app-clinicworks-frontend-${envName}-centralindia'
param existingFunctionAppName string = 'func-clinicworks-${envName}'
param existingDatabaseServerName string = 'psql-clinicworks-${envName}'

// Database Secrets (Passed in securely from GitHub Actions)
param dbAdminUser string
@secure()
param dbAdminPassword string

// ==========================================
// 1. App Service Plan & Web Apps
// ==========================================
module webApps 'modules/appservice.bicep' = {
  name: 'deploy-web-apps'
  params: {
    location: location
    appServicePlanName: 'ASP-clinicworks-${envName}'
    backendAppName: existingBackendAppName
    frontendAppName: existingFrontendAppName
    containerRegistryName: existingContainerRegistryName
  }
}

// ==========================================
// 2. Monitoring (App Insights & Alerts)
// ==========================================
module monitoring 'modules/monitoring.bicep' = {
  name: 'deploy-monitoring'
  params: {
    location: location
    appInsightsName: 'appi-clinicworks-${envName}'
    logAnalyticsWorkspaceName: 'law-clinicworks-${envName}'
    actionGroupName: 'ag-clinicworks-devops'
    actionGroupEmailAddress: alertEmailAddress
    backendAppId: webApps.outputs.backendAppId
    functionAppId: functions.outputs.functionAppId
  }
}

// ==========================================
// 3. Azure Functions & Storage
// ==========================================
module functions 'modules/functions.bicep' = {
  name: 'deploy-functions'
  params: {
    location: location
    functionAppName: existingFunctionAppName
    appServicePlanId: resourceId('Microsoft.Web/serverfarms', 'ASP-clinicworks-${envName}')
    storageAccountName: 'stclinicworks${envName}'
    applicationInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    applicationInsightsInstrumentationKey: monitoring.outputs.appInsightsInstrumentationKey
  }
  dependsOn: [
    webApps // Ensure the App Service Plan exists first
  ]
}

// ==========================================
// 4. PostgreSQL Database
// ==========================================
module database 'modules/database.bicep' = {
  name: 'deploy-database'
  params: {
    location: location
    serverName: existingDatabaseServerName
    databaseName: 'clinicworks'
    adminUsername: dbAdminUser
    adminPassword: dbAdminPassword
  }
}
