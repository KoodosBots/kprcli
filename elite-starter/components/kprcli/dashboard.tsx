"use client";

import { useKprCliAuth, useTelegramBot } from '@/lib/hooks/use-kprcli-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Zap, 
  CreditCard, 
  Settings, 
  Activity, 
  Users, 
  FileText,
  Link,
  Play,
  Pause,
  BarChart3
} from 'lucide-react';
import { useState, useEffect } from 'react';

// Types
interface AutomationJob {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  formUrl: string;
  createdAt: string;
  completedAt?: string;
  success: boolean;
}

interface AutomationStats {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  successRate: number;
  averageTime: number;
}

export default function KprCliDashboard() {
  const { 
    kprCliUser, 
    loading, 
    isAdmin, 
    hasSubscription, 
    canUseTelegramBot,
    canUseAIAutomation 
  } = useKprCliAuth();

  const { 
    isLinked: telegramLinked, 
    linkingToken, 
    generateLinkingToken,
    canUseBot 
  } = useTelegramBot();

  const [automationJobs, setAutomationJobs] = useState<AutomationJob[]>([]);
  const [automationStats, setAutomationStats] = useState<AutomationStats>({
    totalJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    successRate: 0,
    averageTime: 0
  });

  // Load user data and automation history
  useEffect(() => {
    if (kprCliUser) {
      loadAutomationData();
    }
  }, [kprCliUser]);

  const loadAutomationData = async () => {
    try {
      const response = await fetch('/api/automation/history');
      const data = await response.json();
      setAutomationJobs(data.jobs || []);
      setAutomationStats(data.stats || automationStats);
    } catch (error) {
      console.error('Failed to load automation data:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!kprCliUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Welcome to KprCli</CardTitle>
            <CardDescription>Please complete your authentication to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">KprCli Dashboard</h1>
          <p className="text-muted-foreground">
            AI-powered form automation at your fingertips
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Badge variant={hasSubscription ? "default" : "secondary"}>
            {kprCliUser.subscription_tier.toUpperCase()}
          </Badge>
          <Badge variant="outline">
            {kprCliUser.token_balance} tokens
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kprCliUser.token_balance}</div>
            <p className="text-xs text-muted-foreground">
              Available for automation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{automationStats.successRate}%</div>
            <Progress value={automationStats.successRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{automationStats.totalJobs}</div>
            <p className="text-xs text-muted-foreground">
              Forms automated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Telegram Bot</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge variant={telegramLinked ? "default" : "secondary"}>
                {telegramLinked ? "Linked" : "Not Linked"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {canUseBot ? "Squad tier feature" : "Upgrade to Squad"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="automation" className="space-y-4">
        <TabsList>
          <TabsTrigger value="automation">Form Automation</TabsTrigger>
          <TabsTrigger value="telegram">Telegram Bot</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Form Automation Tab */}
        <TabsContent value="automation" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* New Automation */}
            <Card>
              <CardHeader>
                <CardTitle>Create New Automation</CardTitle>
                <CardDescription>
                  Train AI to fill forms automatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Form URL</label>
                  <input 
                    className="w-full p-2 border rounded-md"
                    placeholder="https://example.com/form"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Profile</label>
                  <select className="w-full p-2 border rounded-md">
                    <option>Select customer profile...</option>
                    <option>John Doe - Personal</option>
                    <option>Jane Smith - Business</option>
                  </select>
                </div>
                <Button className="w-full">
                  <Play className="w-4 h-4 mr-2" />
                  Start Training
                </Button>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Manage your automation workflow
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Customer Profiles
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  View Form Templates
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Buy More Tokens
                </Button>
                <Separator />
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="w-4 h-4 mr-2" />
                  AI Model Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Automation Jobs</CardTitle>
              <CardDescription>
                Your latest form automation activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {automationJobs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No automation jobs yet. Create your first one above!
                </p>
              ) : (
                <div className="space-y-4">
                  {automationJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Badge variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'running' ? 'secondary' :
                          job.status === 'failed' ? 'destructive' : 'outline'
                        }>
                          {job.status}
                        </Badge>
                        <div>
                          <p className="font-medium">{job.name}</p>
                          <p className="text-sm text-muted-foreground">{job.formUrl}</p>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telegram Bot Tab */}
        <TabsContent value="telegram" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Telegram Bot Integration</CardTitle>
                <CardDescription>
                  Control your automation remotely via Telegram
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canUseBot ? (
                  <div className="text-center py-6">
                    <Bot className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-2">Upgrade to Squad Tier</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Telegram bot access is exclusive to Squad tier subscribers
                    </p>
                    <Button>Upgrade Now</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Connection Status</span>
                      <Badge variant={telegramLinked ? "default" : "secondary"}>
                        {telegramLinked ? "Connected" : "Not Connected"}
                      </Badge>
                    </div>
                    
                    {!telegramLinked ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Link your Telegram account to enable remote control
                        </p>
                        {linkingToken ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Send this command to @KprCliBot:</p>
                            <code className="block p-2 bg-gray-100 rounded text-sm">
                              /link {linkingToken}
                            </code>
                            <p className="text-xs text-muted-foreground">
                              Token expires in 15 minutes
                            </p>
                          </div>
                        ) : (
                          <Button onClick={generateLinkingToken}>
                            <Link className="w-4 h-4 mr-2" />
                            Generate Linking Token
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2 text-green-600">
                          <Bot className="w-4 h-4" />
                          <span className="text-sm">Connected to @KprCliBot</span>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Available Commands:</p>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p><code>/status</code> - Check system status</p>
                            <p><code>/jobs</code> - List automation jobs</p>
                            <p><code>/start [url]</code> - Start new automation</p>
                            <p><code>/balance</code> - Check token balance</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Remote Features</CardTitle>
                <CardDescription>
                  What you can do via Telegram bot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Activity className="w-4 h-4 text-green-600" />
                    <span className="text-sm">Monitor automation jobs</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Play className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Start/stop automations</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <span className="text-sm">View performance stats</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm">Check token balance</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Success Rate</span>
                    <span>{automationStats.successRate}%</span>
                  </div>
                  <Progress value={automationStats.successRate} />
                  
                  <div className="flex justify-between">
                    <span>Average Time</span>
                    <span>{automationStats.averageTime}s</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Total Jobs</span>
                    <span>{automationStats.totalJobs}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Tokens Used</span>
                    <span>{1000 - kprCliUser.token_balance}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Forms Automated</span>
                    <span>{automationStats.totalJobs}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Time Saved</span>
                    <span>~{Math.floor(automationStats.totalJobs * 5)}min</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>
                Manage your KprCli account preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Subscription Tier</label>
                  <p className="text-lg font-bold">{kprCliUser.subscription_tier.toUpperCase()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Badge variant={hasSubscription ? "default" : "secondary"}>
                    {kprCliUser.subscription_status}
                  </Badge>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h4 className="font-medium">AI Model Preferences</h4>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Use Groq (fastest)</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Use OpenRouter (most capable)</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" />
                    <span className="text-sm">Use Ollama (local/private)</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}