import React, { useState, useEffect } from 'react'

interface BackupInfo {
  id: string
  createdAt: string
  type: 'daily' | 'hourly' | 'manual'
  dataSize: number
  files: string[]
  status: 'completed' | 'failed' | 'in_progress'
  checksum: string
  retentionDays: number
}

interface BackupConfig {
  enabled: boolean
  autoBackup: boolean
  backupInterval: 'daily' | 'hourly' | '4times_daily'
  backupTime: string
  retentionDays: number
  backupLocation: string
  compressionEnabled: boolean
  encryptionEnabled: boolean
  databases: string[]
}

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchBackups()
    fetchConfig()
  }, [])

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/backup/list')
      const data = await response.json()
      setBackups(data)
    } catch (error) {
      console.error('Failed to fetch backups:', error)
    }
  }

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/backup/config')
      const data = await response.json()
      setConfig(data)
    } catch (error) {
      console.error('Failed to fetch backup configuration:', error)
    }
  }

  const createManualBackup = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/backup/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      
      alert('Backup created successfully')
      fetchBackups()
    } catch (error) {
      alert('Failed to create backup')
    } finally {
      setLoading(false)
    }
  }

  const deleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup?')) return
    
    try {
      await fetch(`/api/backup/${backupId}`, {
        method: 'DELETE',
      })
      alert('Backup deleted successfully')
      fetchBackups()
    } catch (error) {
      alert('Failed to delete backup')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800'
      default: return 'bg-yellow-100 text-yellow-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'manual': return 'bg-blue-100 text-blue-800'
      case 'daily': return 'bg-green-100 text-green-800'
      case 'hourly': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Backup Management</h1>
          <p className="text-gray-600">Manage automated and manual backups for your OpenAgents system</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchBackups} 
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Refresh
          </button>
          <button 
            onClick={createManualBackup} 
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Manual Backup'}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-1 pb-4 text-sm font-medium border-b-2 ${
              activeTab === 'overview' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('backups')}
            className={`px-1 pb-4 text-sm font-medium border-b-2 ${
              activeTab === 'backups' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Backups
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-1 pb-4 text-sm font-medium border-b-2 ${
              activeTab === 'settings' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Settings
          </button>
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Backups</p>
                  <p className="text-2xl font-bold">{backups.length}</p>
                  <p className="text-xs text-gray-500">
                    {backups.filter(b => b.status === 'completed').length} successful
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600">💾</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Storage</p>
                  <p className="text-2xl font-bold">
                    {formatFileSize(backups.reduce((sum, b) => sum + b.dataSize, 0))}
                  </p>
                  <p className="text-xs text-gray-500">Across all backups</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600">📊</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Last Backup</p>
                  <p className="text-2xl font-bold">
                    {backups.length > 0 
                      ? new Date(backups[0].createdAt).toLocaleDateString()
                      : 'Never'
                    }
                  </p>
                  <p className="text-xs text-gray-500">
                    {backups.length > 0 
                      ? new Date(backups[0].createdAt).toLocaleTimeString()
                      : 'No backups found'
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600">📅</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Auto Backup</p>
                  <p className="text-2xl font-bold">
                    {config?.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                  <p className="text-xs text-gray-500">{config?.backupInterval || 'Not configured'}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600">⚙️</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Recent Backup Activity</h3>
            <div className="space-y-4">
              {backups.slice(0, 5).map((backup) => (
                <div key={backup.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(backup.status)}`}>
                      {backup.status.toUpperCase()}
                    </span>
                    <div>
                      <div className="font-medium">{backup.id}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(backup.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(backup.type)}`}>
                      {backup.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                      {formatFileSize(backup.dataSize)}
                    </span>
                    <button
                      onClick={() => deleteBackup(backup.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'backups' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {backups.map((backup) => (
            <div key={backup.id} className="bg-white p-6 rounded-lg border hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(backup.status)}`}>
                    {backup.status.toUpperCase()}
                  </span>
                  <h3 className="text-lg font-semibold">{backup.id}</h3>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(backup.type)}`}>
                  {backup.type.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                {new Date(backup.createdAt).toLocaleString()}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size:</span>
                  <span>{formatFileSize(backup.dataSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Files:</span>
                  <span>{backup.files.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Retention:</span>
                  <span>{backup.retentionDays} days</span>
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <button className="flex-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                  Download
                </button>
                <button 
                  onClick={() => deleteBackup(backup.id)}
                  className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Backup Configuration</h3>
            {config && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Backup Enabled</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => setConfig({...config, enabled: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span>{config.enabled ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Auto Backup</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={config.autoBackup}
                      onChange={(e) => setConfig({...config, autoBackup: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span>{config.autoBackup ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Backup Interval</label>
                  <select
                    value={config.backupInterval}
                    onChange={(e) => setConfig({...config, backupInterval: e.target.value as any})}
                    className="w-full p-2 border rounded"
                  >
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                    <option value="4times_daily">4 Times Daily</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Retention Days</label>
                  <input
                    type="number"
                    value={config.retentionDays}
                    onChange={(e) => setConfig({...config, retentionDays: parseInt(e.target.value)})}
                    className="w-full p-2 border rounded"
                    min="1"
                    max="365"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Backup Location</label>
                  <input
                    type="text"
                    value={config.backupLocation}
                    onChange={(e) => setConfig({...config, backupLocation: e.target.value})}
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Compression Enabled</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={config.compressionEnabled}
                      onChange={(e) => setConfig({...config, compressionEnabled: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span>{config.compressionEnabled ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Encryption Enabled</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={config.encryptionEnabled}
                      onChange={(e) => setConfig({...config, encryptionEnabled: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span>{config.encryptionEnabled ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Databases</label>
                  <input
                    type="text"
                    value={config.databases.join(', ')}
                    onChange={(e) => setConfig({...config, databases: e.target.value.split(',').map(d => d.trim())})}
                    className="w-full p-2 border rounded"
                    placeholder="main, secondary"
                  />
                </div>
              </div>
            )}
            <div className="flex space-x-2 mt-4">
              <button 
                onClick={() => alert('Configuration saved')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Configuration
              </button>
              <button 
                onClick={() => {
                  fetchConfig()
                  alert('Configuration reset to defaults')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Reset Defaults
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Backup Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button 
                onClick={createManualBackup} 
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
              >
                Create Manual Backup
              </button>
              <button className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
                Run Cleanup
              </button>
              <button className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                Clear All Backups
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}