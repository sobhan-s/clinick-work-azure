param location string
param serverName string
param adminUsername string
@secure()
param adminPassword string

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2026-04-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '18'
    administratorLogin: adminUsername
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Disabled'
      iops: 120
      tier: 'P4'
      type: 'Premium_LRS'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
      tenantId: subscription().tenantId
    }
    dataEncryption: {
      type: 'SystemManaged'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    replicationRole: 'Primary'
    replica: {
      role: 'Primary'
    }
  }
}
