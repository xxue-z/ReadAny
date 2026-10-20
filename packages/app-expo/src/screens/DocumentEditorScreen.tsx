import { ChevronLeftIcon, EyeIcon, EditIcon } from "@/components/ui/Icon";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useLibraryStore } from "@/stores/library-store";
import {
  type ThemeColors,
  fontSize,
  fontWeight,
  radius,
  useColors,
  withOpacity,
} from "@/styles/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { getPlatformService } from "@readany/core/services";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DocumentEditorRoute = RouteProp<RootStackParamList, "DocumentEditor">;

// Simple Markdown preview component (lightweight, no external dep needed for basic rendering)
function MarkdownPreview({ content, colors }: { content: string; colors: ThemeColors }) {
  const lines = content.split("\n");
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <Text
              key={i}
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: colors.foreground,
                marginBottom: 12,
                marginTop: i > 0 ? 20 : 0,
              }}
            >
              {line.slice(2)}
            </Text>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <Text
              key={i}
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: colors.foreground,
                marginBottom: 10,
                marginTop: 16,
              }}
            >
              {line.slice(3)}
            </Text>
          );
        }
        if (line.startsWith("### ")) {
          return (
            <Text
              key={i}
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: colors.foreground,
                marginBottom: 8,
                marginTop: 12,
              }}
            >
              {line.slice(4)}
            </Text>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <View key={i} style={{ flexDirection: "row", paddingLeft: 12, marginBottom: 4 }}>
              <Text style={{ color: colors.mutedForeground, marginRight: 6 }}>{"\u2022"}</Text>
              <Text style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.foreground }}>
                {line.slice(2)}
              </Text>
            </View>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <View
              key={i}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: colors.border,
                paddingLeft: 10,
                marginBottom: 6,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 14, fontStyle: "italic", color: colors.mutedForeground }}>
                {line.slice(2)}
              </Text>
            </View>
          );
        }
        if (/^\*\*.*\*\*$/.test(line)) {
          const text = line.replace(/^\*\*/, "").replace(/\*\*$/, "");
          return (
            <Text
              key={i}
              style={{
                fontSize: 15,
                fontWeight: "700",
                lineHeight: 22,
                color: colors.foreground,
                marginBottom: 4,
              }}
            >
              {text}
            </Text>
          );
        }
        if (line.trim() === "") {
          return <View key={i} style={{ height: 10 }} />;
        }
        return (
          <Text
            key={i}
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.foreground,
              marginBottom: 4,
            }}
          >
            {line}
          </Text>
        );
      })}
    </ScrollView>
  );
}

// Helper: find the book dir path and md path from a book
function getMdPath(bookId: string): Promise<string> {
  return (async () => {
    const platform = getPlatformService();
    const appData = await platform.getAppDataDir();
    return platform.joinPath(appData, `books/${bookId}.md`);
  })();
}

function getEpubPath(bookId: string): Promise<string> {
  return (async () => {
    const platform = getPlatformService();
    const appData = await platform.getAppDataDir();
    return platform.joinPath(appData, `books/${bookId}.epub`);
  })();
}

export function DocumentEditorScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const route = useRoute<DocumentEditorRoute>();
  const layout = useResponsiveLayout();
  const { bookId } = route.params;
  const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
  const updateBook = useLibraryStore((s) => s.updateBook);

  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const s = useMemo(() => makeStyles(colors, layout.horizontalPadding), [colors, layout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mdPath = await getMdPath(bookId);
        const platform = getPlatformService();
        const bytes = await platform.readFile(mdPath);
        const decoder = new TextDecoder("utf-8");
        if (!cancelled) {
          setMarkdown(decoder.decode(bytes));
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("[DocumentEditor] Failed to load markdown:", err);
        if (!cancelled) {
          setMarkdown(book?.meta.title ? `# ${book.meta.title}` : "# Untitled");
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, book?.meta.title]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const title = markdown.match(/^#\s+(.+)/m)?.[1]?.trim() || book?.meta.title || "Untitled";
      const { MdToEpubConverter } = await import("@readany/core/utils/md-to-epub");
      const converter = new MdToEpubConverter();
      const result = converter.convertToBytes({ markdown, title });

      const mdPath = await getMdPath(bookId);
      const epubPath = await getEpubPath(bookId);
      const platform = getPlatformService();
      const encoder = new TextEncoder();
      await platform.writeFile(mdPath, encoder.encode(markdown));
      await platform.writeFile(epubPath, result.epubBytes);

      await updateBook(bookId, {
        meta: { ...book?.meta, title: result.bookTitle },
        updatedAt: Date.now(),
      });

      Alert.alert("", t("library.editor.saved", "已保存"));
    } catch (err) {
      console.error("[DocumentEditor] Save failed:", err);
      Alert.alert(t("library.editor.saveError", "保存失败"), String(err));
    } finally {
      setIsSaving(false);
    }
  }, [markdown, bookId, book?.meta, updateBook, isSaving, t]);

  if (!bookId) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.errorText}>{t("library.bookNotFound", "Book not found")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => nav.goBack()}>
          <ChevronLeftIcon size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {book?.meta.title || t("library.editor.title", "编辑文档")}
        </Text>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => setIsPreview(!isPreview)}
          >
            {isPreview ? (
              <EditIcon size={18} color={colors.mutedForeground} />
            ) : (
              <EyeIcon size={18} color={colors.mutedForeground} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerBtn, s.saveBtn]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={s.saveText}>{t("library.editor.save", "保存")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isPreview ? (
        <MarkdownPreview content={markdown} colors={colors} />
      ) : (
        <KeyboardAwareScrollView style={{ flex: 1 }}>
          <TextInput
            style={s.editor}
            value={markdown}
            onChangeText={setMarkdown}
            multiline
            textAlignVertical="top"
            placeholder="# Title"
            placeholderTextColor={colors.mutedForeground}
            autoFocus={!markdown || markdown === "# Untitled"}
            scrollEnabled={false}
          />
        </KeyboardAwareScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors, hPad: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: hPad,
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: colors.foreground,
      marginHorizontal: 8,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      width: undefined,
    },
    saveText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: colors.primaryForeground,
    },
    editor: {
      flex: 1,
      padding: 16,
      fontSize: 15,
      lineHeight: 22,
      color: colors.foreground,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      minHeight: 400,
    },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: {
      fontSize: fontSize.lg,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 40,
    },
  });
