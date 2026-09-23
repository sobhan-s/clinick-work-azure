param location string
param docIntelName string

resource formRecognizer 'Microsoft.CognitiveServices/accounts@2026-05-15-preview' = {
  name: docIntelName
  location: location
  sku: {
    name: 'F0' // Free tier as seen in export
  }
  kind: 'FormRecognizer'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: docIntelName
    publicNetworkAccess: 'Enabled'
  }
}
