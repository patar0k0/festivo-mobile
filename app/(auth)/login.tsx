import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth/useAuth';
import { registerPush } from '@/lib/push/registerPush';

type Mode = 'login' | 'register' | 'forgot';

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Невалиден email или парола.';
  if (msg.includes('Email not confirmed')) return 'Потвърди email адреса си, след което влез.';
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return 'Вече съществува акаунт с този email.';
  if (msg.includes('Password should be') || msg.includes('weak_password'))
    return 'Паролата трябва да е поне 6 символа.';
  if (msg.includes('Unable to validate email') || msg.includes('valid email'))
    return 'Невалиден email адрес.';
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Твърде много опити. Моля, опитай по-късно.';
  return msg;
}

export default function LoginScreen() {
  const { login, register, resetPassword } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirm(false);
    setFocusedField(null);
  };

  async function handleSubmit() {
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError('Въведи своя email адрес.');
      return;
    }

    if (mode === 'forgot') {
      setSubmitting(true);
      try {
        const { error: err } = await resetPassword(email.trim());
        if (err) {
          setError(translateError(err.message));
          return;
        }
        setSuccessMessage('Изпратихме ти линк за нулиране на паролата. Провери имейла си.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) {
      setError('Въведи своята парола.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Паролата трябва да е поне 6 символа.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Паролите не съвпадат.');
        return;
      }
      setSubmitting(true);
      try {
        const { error: err } = await register(email.trim(), password);
        if (err) {
          setError(translateError(err.message));
          return;
        }
        setSuccessMessage('Акаунтът е създаден! Провери email адреса си за потвърждение, след което влез.');
        switchMode('login');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await login(email.trim(), password);
      if (err) {
        setError(translateError(err.message));
        return;
      }
      void registerPush();
      router.replace('/(tabs)');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = (field: string) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Brand */}
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.brandName}>Festivo</Text>
          <Text style={styles.brandTagline}>Открий своя следващ фестивал</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>

          {/* Tab switcher */}
          {!isForgot ? (
            <View style={styles.tabBar}>
              <Pressable
                style={[styles.tab, isLogin && styles.tabActive]}
                onPress={() => switchMode('login')}
                accessibilityRole="tab"
                accessibilityState={{ selected: isLogin }}>
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Вход</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, isRegister && styles.tabActive]}
                onPress={() => switchMode('register')}
                accessibilityRole="tab"
                accessibilityState={{ selected: isRegister }}>
                <Text style={[styles.tabText, isRegister && styles.tabTextActive]}>Регистрация</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.forgotHeader}>
              <Pressable
                onPress={() => switchMode('login')}
                style={styles.backBtn}
                accessibilityRole="button">
                <Ionicons name="arrow-back" size={18} color="#475569" />
                <Text style={styles.backBtnText}>Назад</Text>
              </Pressable>
              <Text style={styles.forgotTitle}>Забравена парола</Text>
              <Text style={styles.forgotSubtitle}>
                Въведи email адреса си и ще ти изпратим линк за нулиране на паролата.
              </Text>
            </View>
          )}

          {/* Success */}
          {successMessage ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={styles.successText}>{successMessage}</Text>
            </Animated.View>
          ) : null}

          {/* Error */}
          {error ? (
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Fields */}
          <View style={styles.fields}>
            <View>
              <Text style={styles.label}>Email адрес</Text>
              <TextInput
                style={inputStyle('email')}
                placeholder="name@example.com"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType={isForgot ? 'done' : 'next'}
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={() => {
                  if (!isForgot) passwordRef.current?.focus();
                  else void handleSubmit();
                }}
              />
            </View>

            {!isForgot ? (
              <>
                <View>
                  <Text style={styles.label}>Парола</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      ref={passwordRef}
                      style={[inputStyle('password'), styles.inputWithIcon]}
                      placeholder="••••••••"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showPassword}
                      textContentType={isRegister ? 'newPassword' : 'password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      returnKeyType={isRegister ? 'next' : 'done'}
                      value={password}
                      onChangeText={setPassword}
                      editable={!submitting}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={() => {
                        if (isRegister) confirmRef.current?.focus();
                        else void handleSubmit();
                      }}
                    />
                    <Pressable
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      accessibilityLabel={showPassword ? 'Скрий паролата' : 'Покажи паролата'}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#94A3B8"
                      />
                    </Pressable>
                  </View>
                </View>

                {isRegister ? (
                  <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                    <Text style={styles.label}>Потвърди паролата</Text>
                    <View style={styles.inputWrap}>
                      <TextInput
                        ref={confirmRef}
                        style={[inputStyle('confirm'), styles.inputWithIcon]}
                        placeholder="••••••••"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showConfirm}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        returnKeyType="done"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        editable={!submitting}
                        onFocus={() => setFocusedField('confirm')}
                        onBlur={() => setFocusedField(null)}
                        onSubmitEditing={() => void handleSubmit()}
                      />
                      <Pressable
                        style={styles.eyeBtn}
                        onPress={() => setShowConfirm((v) => !v)}
                        accessibilityLabel={showConfirm ? 'Скрий паролата' : 'Покажи паролата'}>
                        <Ionicons
                          name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color="#94A3B8"
                        />
                      </Pressable>
                    </View>
                  </Animated.View>
                ) : null}
              </>
            ) : null}
          </View>

          {/* Submit button */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              submitting && styles.buttonDisabled,
              pressed && !submitting && styles.buttonPressed,
            ]}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            accessibilityRole="button">
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? 'Влез в акаунта' : isRegister ? 'Създай акаунт' : 'Изпрати линк'}
              </Text>
            )}
          </Pressable>

          {/* Forgot password link */}
          {isLogin ? (
            <Pressable
              style={styles.forgotLink}
              onPress={() => switchMode('forgot')}
              accessibilityRole="button">
              <Text style={styles.forgotLinkText}>Забравена парола?</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          С използването на приложението приемаш нашите{' '}
          <Text style={styles.footerLink}>Условия за ползване</Text>
          {' '}и{' '}
          <Text style={styles.footerLink}>Политика за поверителност</Text>.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
  },

  // ─── Brand ───────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 20,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },

  // ─── Card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    gap: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },

  // ─── Tabs ─────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 13,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  // ─── Forgot header ────────────────────────────────────────────────────
  forgotHeader: {
    gap: 6,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: 4,
  },
  backBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  forgotTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  forgotSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },

  // ─── Status boxes ────────────────────────────────────────────────────
  successBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  successText: {
    flex: 1,
    fontSize: 14,
    color: '#15803D',
    lineHeight: 20,
  },
  errorBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
  },

  // ─── Form fields ─────────────────────────────────────────────────────
  fields: {
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 11 : 13,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FAFAFA',
  },
  inputFocused: {
    borderColor: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 13,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    padding: 4,
  },

  // ─── Button ──────────────────────────────────────────────────────────
  button: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ─── Forgot link ─────────────────────────────────────────────────────
  forgotLink: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  forgotLinkText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },

  // ─── Footer ──────────────────────────────────────────────────────────
  footer: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: '#64748B',
    fontWeight: '600',
  },
});
