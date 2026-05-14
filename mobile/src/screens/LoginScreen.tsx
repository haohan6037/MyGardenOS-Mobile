import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';
import { auth } from '../services/auth';
import { useAuth } from '../contexts/AuthContext';

type LoginStep = 'email' | 'code' | 'password';

export function LoginScreen() {
  const { login } = useAuth();
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [nextStep, setNextStep] = useState<'set_password' | 'verify_password' | null>(null);
  const [loading, setLoading] = useState(false);
  const [debugCode, setDebugCode] = useState('');
  const [timer, setTimer] = useState(0);

  const requestCode = async () => {
    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }
    setLoading(true);
    try {
      const result = await auth.requestCode(email);
      setStep('code');
      setDebugCode(result.debug_code || '');
      setTimer(Math.ceil(result.expires_in_seconds));
      if (result.delivered) {
        Alert.alert(
          'Code Sent',
          `Verification code sent to ${email}. If you do not receive it, use the debug code shown below.`,
        );
      } else {
        Alert.alert(
          'Email not delivered',
          `Switching to debug code login. Reason: ${result.delivery_error || 'unknown'}`,
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Code must be 6 digits');
      return;
    }
    setLoading(true);
    try {
      const result = await auth.verifyCode(email, code);
      setVerifyToken(result.verify_token);
      setNextStep(result.next_step as 'set_password' | 'verify_password');
      setStep('password');
      setCode('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handlePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const result =
        nextStep === 'set_password'
          ? await auth.setPassword(verifyToken, password)
          : await auth.verifyPassword(verifyToken, password);
      await login(result.access_token, result.user);
    } catch (err: any) {
      Alert.alert('Error', err.message || `Failed to ${nextStep === 'set_password' ? 'set' : 'verify'} password`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      {step === 'email' && (
        <View style={s.container}>
          <Text style={s.title}>Welcome</Text>
          <Text style={s.subtitle}>Sign in with your email</Text>
          <TextInput
            style={s.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            keyboardType="email-address"
          />
          <Pressable style={[s.button, loading && s.buttonDisabled]} onPress={requestCode} disabled={loading}>
            <Text style={s.buttonText}>{loading ? 'Sending...' : 'Send Verification Code'}</Text>
          </Pressable>
        </View>
      )}

      {step === 'code' && (
        <View style={s.container}>
          <Text style={s.title}>Verification Code</Text>
          <Text style={s.subtitle}>Enter the 6-digit code sent to {email}</Text>
          {debugCode && <Text style={s.debug}>Debug code: {debugCode}</Text>}
          <TextInput
            style={s.input}
            placeholder="000000"
            value={code}
            onChangeText={setCode}
            editable={!loading}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable style={[s.button, loading && s.buttonDisabled]} onPress={verifyCode} disabled={loading}>
            <Text style={s.buttonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
          </Pressable>
          <Pressable onPress={() => { setStep('email'); setCode(''); setDebugCode(''); }}>
            <Text style={s.link}>Back to email</Text>
          </Pressable>
          {timer > 0 && <Text style={s.timer}>Code expires in {timer}s</Text>}
        </View>
      )}

      {step === 'password' && (
        <View style={s.container}>
          <Text style={s.title}>{nextStep === 'set_password' ? 'Set Password' : 'Enter Password'}</Text>
          <Text style={s.subtitle}>
            {nextStep === 'set_password' ? 'Create a secure password' : 'Verify your password to login'}
          </Text>
          <TextInput
            style={s.input}
            placeholder="Password (min 6 characters)"
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            secureTextEntry
          />
          <Pressable style={[s.button, loading && s.buttonDisabled]} onPress={handlePassword} disabled={loading}>
            <Text style={s.buttonText}>{loading ? 'Processing...' : 'Continue'}</Text>
          </Pressable>
          <Pressable onPress={() => { setStep('code'); setPassword(''); }}>
            <Text style={s.link}>Back to verification</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 80,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.green,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  link: {
    color: colors.green,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  debug: {
    fontSize: 12,
    color: '#FF6B6B',
    backgroundColor: '#FFE0E0',
    padding: 8,
    borderRadius: 6,
    marginBottom: 16,
    fontWeight: '600',
  },
  timer: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
  },
});
