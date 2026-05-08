import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import {
  EMPTY_ONBOARDING_DRAFT,
  getOnboardingDraft,
  saveOnboardingDraft,
  syncOnboardingToBackend,
  type OnboardingDraft,
} from "@/lib/personalization/onboarding";

const CITY_OPTIONS = ["sofia", "plovdiv", "varna", "burgas", "veliko-tarnovo"];
const CATEGORY_OPTIONS = ["music", "food", "culture", "family", "crafts"];
const NOTIFICATION_OPTIONS = ["categories", "cities", "organizers", "nearby", "trending"];
const ORGANIZER_SUGGESTIONS = [
  { id: "c0a80100-0000-4000-8000-000000000001", label: "Sofia Fest Team" },
  { id: "c0a80100-0000-4000-8000-000000000002", label: "Plovdiv Events" },
  { id: "c0a80100-0000-4000-8000-000000000003", label: "Sea Culture Club" },
];

function ToggleChips({
  values,
  selected,
  onToggle,
}: {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipsRow}>
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <Pressable key={value} onPress={() => onToggle(value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const anim = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    let mounted = true;
    void getOnboardingDraft().then((existing) => {
      if (!mounted) return;
      setDraft(existing);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const step = Math.min(4, Math.max(0, draft.step));
  const isLast = step === 4;

  const title = useMemo(() => {
    switch (step) {
      case 0:
        return "Favorite categories";
      case 1:
        return "Favorite cities";
      case 2:
        return "Notification interests";
      case 3:
        return "Location permission";
      default:
        return "Follow organizers";
    }
  }, [step]);

  const subtitle = useMemo(() => {
    switch (step) {
      case 0:
        return "Pick what you love. You can edit later.";
      case 1:
        return "We will prioritize local discovery.";
      case 2:
        return "Choose what should trigger engagement.";
      case 3:
        return "Optional, helps with near-you results.";
      default:
        return "Suggestions to personalize your feed.";
    }
  }, [step]);

  const persist = async (next: OnboardingDraft) => {
    setDraft(next);
    await saveOnboardingDraft(next);
  };

  const toggleArray = (key: "categories" | "cities" | "notificationInterests" | "organizerIds", value: string) => {
    const set = new Set(draft[key]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    void persist({ ...draft, [key]: [...set] });
  };

  const goNext = () => {
    const nextStep = Math.min(4, step + 1);
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.9, duration: 120, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    void persist({ ...draft, step: nextStep });
  };

  const requestLocation = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      void persist({ ...draft, locationPermissionAsked: true });
    }
  };

  const finish = async (skipped: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    const finalState: OnboardingDraft = { ...draft, completed: !skipped, skipped, step: 4 };
    await persist(finalState);
    try {
      await syncOnboardingToBackend(finalState);
    } catch {
      // keep flow resilient; local state remains saved for resume/retry
    } finally {
      setSubmitting(false);
      router.replace("/(tabs)");
    }
  };

  if (!hydrated) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Loading personalization...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.card, { transform: [{ scale: anim }] }]}>
        <Text style={styles.step}>Step {step + 1} / 5</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {step === 0 ? (
          <ToggleChips values={CATEGORY_OPTIONS} selected={draft.categories} onToggle={(v) => toggleArray("categories", v)} />
        ) : null}
        {step === 1 ? (
          <ToggleChips values={CITY_OPTIONS} selected={draft.cities} onToggle={(v) => toggleArray("cities", v)} />
        ) : null}
        {step === 2 ? (
          <ToggleChips
            values={NOTIFICATION_OPTIONS}
            selected={draft.notificationInterests}
            onToggle={(v) => toggleArray("notificationInterests", v)}
          />
        ) : null}
        {step === 3 ? (
          <Pressable onPress={requestLocation} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>
              {draft.locationPermissionAsked ? "Location requested" : "Enable location (optional)"}
            </Text>
          </Pressable>
        ) : null}
        {step === 4 ? (
          <View style={styles.chipsRow}>
            {ORGANIZER_SUGGESTIONS.map((organizer) => {
              const selected = draft.organizerIds.includes(organizer.id);
              return (
                <Pressable
                  key={organizer.id}
                  onPress={() => toggleArray("organizerIds", organizer.id)}
                  style={[styles.chip, selected && styles.chipActive]}>
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{organizer.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.footer}>
        <Pressable onPress={() => finish(true)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Skip for now</Text>
        </Pressable>
        {isLast ? (
          <Pressable onPress={() => finish(false)} style={styles.primaryBtn} disabled={submitting}>
            <Text style={styles.primaryBtnText}>{submitting ? "Saving..." : "Finish"}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={goNext} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Next</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 20,
    justifyContent: "space-between",
  },
  card: {
    marginTop: 44,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 18,
    gap: 10,
  },
  step: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  chipText: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 16,
  },
  primaryBtn: {
    borderRadius: 12,
    backgroundColor: "#0F172A",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  secondaryBtn: {
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryBtnText: {
    color: "#0F172A",
    fontWeight: "700",
  },
});
