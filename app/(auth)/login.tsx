import { AntDesign, Ionicons } from '@expo/vector-icons';
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
  const { login, register, resetPassword, signInWithGoogle } = useAuth();
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const isLoading = submitting || googleLoading;

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

  async function handleGoogleSignIn() {
    setError(null);
    setSuccessMessage(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.outcome === 'success') {
        void registerPush();
        router.replace('/(tabs)');
      } else if (result.outcome === 'error') {
        setError(translateError(result.error.message));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

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
        if (err) { setError(translateError(err.message)); return; }
        setSuccessMessage('Изпратихме ти линк за нулиране на паролата. Провери имейла си.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!password) { setError('Въведи своята парола.'); return; }

    if (mode === 'register') {
      if (password.length < 6) { setError('Паролата трябва да е поне 6 символа.'); return; }
      if (password !== confirmPassword) { setError('Паролите не съвпадат.'); return; }
      setSubmitting(true);
      try {
        const { error: err } = await register(email.trim(), password);
        if (err) { setError(translateError(err.message)); return; }
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
      if (err) { setError(translateError(err.message)); return; }
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
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── Brand ── */}
        <View style={styles.brand}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.brandName}>Festivo</Text>
          <Text style={styles.brandTagline}>Открий своя следващ фестивал</Text>
        </View>

        {/* ── Forgot password ── */}
        {isForgot ? (
          <View style={styles.section}>
            <Pressable onPress={() => switchMode('login')} style={styles.backBtn} accessibilityRole="button">
              <Ionicons name="arrow-back" size={16} color="#64748B" />
              <Text style={styles.backBtnText}>Назад</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>Забравена парола</Text>
            <Text style={styles.sectionSubtitle}>
              Въведи email адреса си и ще ти изпратим линк за нулиране на паролата.
            </Text>

            {successMessage ? (
              <Animated.View entering={FadeIn.duration(220)} style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                <Text style={styles.successText}>{successMessage}</Text>
              </Animated.View>
            ) : null}
            {error ? (
              <Animated.View entering={FadeIn.duration(220)} style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Text style={styles.label}>Email адрес</Text>
            <TextInput
              style={inputStyle('email')}
              placeholder="name@example.com"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="done"
              value={email}
              onChangeText={setEmail}
              editable={!isLoading}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={() => void handleSubmit()}
            />

            <Pressable
              style={[styles.primaryBtn, submitting && styles.btnDisabled]}
              onPress={() => void handleSubmit()}
              disabled={submitting}
              accessibilityRole="button">
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>Изпрати линк</Text>
              }
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>

            {/* ── Google first ── */}
            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                isLoading && styles.btnDisabled,
                pressed && !isLoading && styles.googleBtnPressed,
              ]}
              onPress={() => void handleGoogleSignIn()}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Продължи с Google">
              {googleLoading ? (
                <ActivityIndicator color="#374151" size="small" />
              ) : (
                <>
                  <AntDesign name="google" size={20} color="#EA4335" />
                  <Text style={styles.googleBtnText}>Продължи с Google</Text>
                </>
              )}
            </Pressable>

            {/* ── Divider ── */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>или с имейл</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* ── Status messages ── */}
            {successMessage ? (
              <Animated.View entering={FadeIn.duration(220)} style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                <Text style={styles.successText}>{successMessage}</Text>
              </Animated.View>
            ) : null}
            {error ? (
              <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* ── Email ── */}
            <View style={styles.fieldGroup}>
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
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                editable={!isLoading}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            {/* ── Password ── */}
            <View style={styles.fieldGroup}>
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
                  editable={!isLoading}
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

            {/* ── Confirm password (register only) ── */}
            {isRegister ? (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.fieldGroup}>
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
                    editable={!isLoading}
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

            {/* ── Forgot password link (login only) ── */}
            {isLogin ? (
              <Pressable
                style={styles.forgotLink}
                onPress={() => switchMode('forgot')}
                accessibilityRole="button">
                <Text style={styles.forgotLinkText}>Забравена парола?</Text>
              </Pressable>
            ) : null}

            {/* ── Submit ── */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                submitting && styles.btnDisabled,
                pressed && !submitting && styles.primaryBtnPressed,
              ]}
              onPress={() => void handleSubmit()}
              disabled={isLoading}
              accessibilityRole="button">
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isLogin ? 'Влез в акаунта' : 'Създай акаунт'}
                </Text>
              )}
            </Pressable>

            {/* ── Mode switcher ── */}
            <View style={styles.modeSwitcher}>
              <Text style={styles.modeSwitcherText}>
                {isLogin ? 'Нямаш акаунт?' : 'Вече имаш акаунт?'}
              </Text>
              <Pressable
                onPress={() => switchMode(isLogin ? 'register' : 'login')}
                accessibilityRole="button">
                <Text style={styles.modeSwitcherLink}>
                  {isLogin ? 'Регистрирай се' : 'Влез'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <Text style={styles.footer}>
          С използването на приложението приемаш нашите{' '}
          <Text style={styles.footerLink}>Условия за ползване</Text>
          {' '}и{' '}
          <Text style={styles.footerLink}>Поверителност</Text>.
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
    gap: 28,
  },

  // ── Brand ─────────────────────────────────────────────────────────────
  brand: {
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 22,
  },
  brandName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  brandTagline: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },

  // ── Section ───────────────────────────────────────────────────────────
  section: {
    gap: 14,
  },

  // ── Forgot header ─────────────────────────────────────────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  backBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
  },

  // ── Google button ─────────────────────────────────────────────────────
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  googleBtnPressed: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },

  // ── Divider ───────────────────────────────────────────────────────────
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#CBD5E1',
  },
  dividerText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // ── Status boxes ──────────────────────────────────────────────────────
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

  // ── Form fields ───────────────────────────────────────────────────────
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
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
    backgroundColor: '#FFFFFF',
  },
  inputFocused: {
    borderColor: '#0F172A',
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

  // ── Forgot link ───────────────────────────────────────────────────────
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotLinkText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },

  // ── Primary button ────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Mode switcher ─────────────────────────────────────────────────────
  modeSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
  },
  modeSwitcherText: {
    fontSize: 14,
    color: '#64748B',
  },
  modeSwitcherLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── Footer ────────────────────────────────────────────────────────────
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
