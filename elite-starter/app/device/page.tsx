'use client';

import { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, Monitor, Smartphone, Terminal } from 'lucide-react';

function DevicePageContent() {
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userCode, setUserCode] = useState(searchParams.get('user_code') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);

  // Auto-fill user code from URL or localStorage
  useEffect(() => {
    const code = searchParams.get('user_code');
    if (code) {
      setUserCode(code);
      // Store in localStorage as backup
      localStorage.setItem('device_user_code', code);
    } else {
      // Try to restore from localStorage if no URL parameter
      const storedCode = localStorage.getItem('device_user_code');
      if (storedCode) {
        setUserCode(storedCode);
      }
    }
  }, [searchParams]);

  // Redirect to sign-in if not authenticated, preserving the user_code
  useEffect(() => {
    if (!isSignedIn) {
      const currentCode = searchParams.get('user_code');
      const redirectUrl = currentCode ? `/device?user_code=${currentCode}` : '/device';
      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
    }
  }, [isSignedIn, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode.trim()) {
      setError('Please enter a device code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get Clerk token
      const token = await getToken();
      
      // Verify the device code
      const verifyResponse = await fetch('/api/auth/device/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_code: userCode.toUpperCase().trim(),
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyData.error_description || 'Invalid device code');
      }

      // Show device information for confirmation
      setDeviceInfo(verifyData);
      
    } catch (err: any) {
      setError(err.message || 'Failed to verify device code');
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    
    try {
      const token = await getToken();
      
      // Approve the device
      const approveResponse = await fetch('/api/auth/device/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_code: userCode.toUpperCase().trim(),
        }),
      });

      const approveData = await approveResponse.json();

      if (!approveResponse.ok) {
        throw new Error(approveData.error_description || 'Failed to approve device');
      }

      setSuccess(true);
      // Clear stored code after successful approval
      localStorage.removeItem('device_user_code');
      setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to approve device');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    setLoading(true);
    
    try {
      const token = await getToken();
      
      // Deny the device
      await fetch('/api/auth/device/deny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_code: userCode.toUpperCase().trim(),
        }),
      });

      router.push('/dashboard');
      
    } catch (err: any) {
      setError(err.message || 'Failed to deny device');
    } finally {
      setLoading(false);
    }
  };

  const getDeviceIcon = (deviceName?: string) => {
    if (!deviceName) return <Monitor className="w-8 h-8" />;
    const name = deviceName.toLowerCase();
    if (name.includes('cli') || name.includes('terminal')) return <Terminal className="w-8 h-8" />;
    if (name.includes('mobile') || name.includes('phone')) return <Smartphone className="w-8 h-8" />;
    return <Monitor className="w-8 h-8" />;
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <h2 className="text-2xl font-semibold">Device Authorized!</h2>
              <p className="text-muted-foreground text-center">
                Your device has been successfully authorized. You can now close this page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (deviceInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Confirm Device Authorization</CardTitle>
            <CardDescription>
              A device is requesting access to your KprCli account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4 p-4 bg-muted rounded-lg">
              {getDeviceIcon(deviceInfo.device_name)}
              <div>
                <p className="font-semibold">{deviceInfo.device_name || 'Unknown Device'}</p>
                {deviceInfo.device_info?.platform && (
                  <p className="text-sm text-muted-foreground">
                    Platform: {deviceInfo.device_info.platform}
                  </p>
                )}
                {deviceInfo.device_info?.hostname && (
                  <p className="text-sm text-muted-foreground">
                    Host: {deviceInfo.device_info.hostname}
                  </p>
                )}
              </div>
            </div>
            
            <Alert>
              <AlertDescription>
                This device will have access to perform actions on your behalf. Only approve devices you recognize.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex space-x-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDeny}
              disabled={loading}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Deny
            </Button>
            <Button
              className="flex-1"
              onClick={handleApprove}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Device Authorization</CardTitle>
          <CardDescription>
            Enter the code displayed on your device to authorize it
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="code" className="text-sm font-medium">
                Device Code
              </label>
              <Input
                id="code"
                type="text"
                placeholder="XXXX-XXXX"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                className="text-center text-lg font-mono tracking-wider"
                maxLength={9}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Enter the 8-character code shown on your device
              </p>
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Continue
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function DevicePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <DevicePageContent />
    </Suspense>
  );
}