import { BookOpenIcon, CheckIcon, ChevronLeftIcon, EditIcon, EyeIcon } from "@/components/ui/Icon";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { useResponsiveLayout } from "@/hooks/use-responsive-layout";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAnnotationStore } from "@/stores";
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
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getPlatformService } from "@readany/core/services";
import { recoverMarkdownSourceFromEpub } from "@readany/core/utils/md-source-recovery";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-marked";
import { SafeAreaView } from "react-native-safe-area-context";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DocumentEditorRoute = RouteProp<RootStackParamList, "DocumentEditor">;

/**
 * Markdown preview for the reading mode, powered by react-native-marked
 * (marked.js under the hood — the same parser as the md→epub converter).
 * Renders the full GFM surface (tables, task lists, fenced code, images)
 * instead of showing raw source for anything the old hand-rolled renderer
 * did not recognise.
 */
function MarkdownPreview({ content, colors }: { content: string; colors: ThemeColors }) {
  return (
    <Markdown
      value={content}
      selectable
      theme={{
        colors: {
          code: colors.muted,
          link: colors.indigo,
          text: colors.foreground,
          border: colors.border,
        },
        spacing: { xs: 2, s: 4, m: 8, l: 16 },
      }}
      styles={{
        h1: {
          fontSize: 24,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 12,
          marginTop: 20,
        },
        h2: {
          fontSize: 20,
          fontWeight: "700",
          color: colors.foreground,
          marginBottom: 10,
          marginTop: 18,
        },
        h3: {
          fontSize: 17,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
          marginTop: 14,
        },
        h4: {
          fontSize: 16,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 8,
          marginTop: 12,
        },
        h5: {
          fontSize: 15,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 6,
          marginTop: 12,
        },
        h6: {
          fontSize: 14,
          fontWeight: "600",
          color: colors.foreground,
          marginBottom: 6,
          marginTop: 12,
        },
        paragraph: { marginBottom: 8 },
        text: { fontSize: 15, lineHeight: 22, color: colors.foreground },
        strong: { fontWeight: "700" },
        strikethrough: { textDecorationLine: "line-through" },
        codespan: {
          backgroundColor: colors.muted,
          color: colors.foreground,
          fontSize: 13,
          borderRadius: 4,
          paddingHorizontal: 4,
          paddingVertical: 1,
        },
        code: { backgroundColor: colors.muted, borderRadius: 8, padding: 12, marginBottom: 8 },
        codeText: {
          color: colors.foreground,
          fontSize: 13,
          lineHeight: 18,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
        },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: colors.border,
          paddingLeft: 12,
          marginBottom: 8,
        },
        link: { color: colors.primary, textDecorationLine: "underline" },
        hr: { backgroundColor: colors.border, marginVertical: 12 },
        list: { marginBottom: 8 },
        li: { fontSize: 15, lineHeight: 22, color: colors.foreground },
        table: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 8,
        },
        tableRow: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        tableCell: { paddingVertical: 6, paddingHorizontal: 10 },
        image: { borderRadius: 8, marginVertical: 8 },
      }}
      flatListProps={{ contentContainerStyle: { padding: 16 } }}
    />
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

/** Create a directory under the app data dir (no-op when it exists). */
async function ensureAppDir(relativePath: string): Promise<void> {
  const platform = getPlatformService();
  const appData = await platform.getAppDataDir();
  try {
    await platform.mkdir(await platform.joinPath(appData, relativePath));
  } catch {
    /* already exists */
  }
}

// Helper: insert Markdown syntax at cursor position
function applyMarkdownSyntax(
  text: string,
  selection: { start: number; end: number },
  syntax: { prefix: string; suffix: string; placeholder: string },
): { text: string; cursorPos: number } {
  const selectedText = text.slice(selection.start, selection.end);
  if (selectedText.length > 0) {
    const newText =
      text.slice(0, selection.start) +
      syntax.prefix +
      selectedText +
      syntax.suffix +
      text.slice(selection.end);
    return {
      text: newText,
      cursorPos:
        selection.start + syntax.prefix.length + selectedText.length + syntax.suffix.length,
    };
  }
  const newText =
    text.slice(0, selection.start) +
    syntax.prefix +
    syntax.placeholder +
    syntax.suffix +
    text.slice(selection.end);
  const cursorPos = selection.start + syntax.prefix.length + syntax.placeholder.length;
  return { text: newText, cursorPos };
}

export function DocumentEditorScreen() {
  const colors = useColors();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const route = useRoute<DocumentEditorRoute>();
  const layout = useResponsiveLayout();
  const { bookId } = route.params;
  const book = useLibraryStore((s) => s.books.find((b) => b.id === bookId));
  const saveDocument = useLibraryStore((s) => s.saveDocument);
  const hasAnnotations = useAnnotationStore(
    (s) =>
      s.highlights.some((highlight) => highlight.bookId === bookId) ||
      s.notes.some((note) => note.bookId === bookId),
  );

  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreview, setIsPreview] = useState(route.params.initialPreview ?? false);
  const [isSaving, setIsSaving] = useState(false);
  /** Source missing and not recoverable: refuse to write (would clobber the book). */
  const [isReadOnly, setIsReadOnly] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last value successfully written to disk (avoids redundant saves). */
  const lastSavedRef = useRef<string | null>(null);
  /** Latest text, readable from the unmount cleanup without stale closures. */
  const markdownRef = useRef("");
  /** Read-only guard, readable from the unmount/AppState callbacks. */
  const readOnlyRef = useRef(false);

  const s = useMemo(() => makeStyles(colors, layout.horizontalPadding), [colors, layout]);

  useEffect(() => {
    readOnlyRef.current = isReadOnly;
  }, [isReadOnly]);

  // Load once per document. `book` is only used for the title fallback, so it
  // must not retrigger the load (that would discard in-progress edits).
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per bookId
  useEffect(() => {
    let cancelled = false;
    const platform = getPlatformService();

    const apply = (text: string) => {
      if (cancelled) return;
      setMarkdown(text);
      markdownRef.current = text;
      lastSavedRef.current = text;
      setIsLoading(false);
    };

    (async () => {
      try {
        const mdPath = await getMdPath(bookId);
        const bytes = await platform.readFile(mdPath);
        apply(new TextDecoder("utf-8").decode(bytes));
        return;
      } catch (err) {
        // Missing `.md`: try the copy embedded in the (synced) EPUB before
        // giving up. Inventing placeholder content here would overwrite the
        // book on the next auto-save.
        console.warn("[DocumentEditor] Markdown missing, trying EPUB recovery:", err);
      }

      try {
        const epubPath = await getEpubPath(bookId);
        const epubBytes = await platform.readFile(epubPath);
        const recovered = await recoverMarkdownSourceFromEpub(epubBytes);
        if (recovered && !cancelled) {
          const appData = await platform.getAppDataDir();
          for (const asset of recovered.assets) {
            const slash = asset.path.lastIndexOf("/");
            if (slash > 0) await ensureAppDir(`books/${asset.path.slice(0, slash)}`);
            const dest = await platform.joinPath(appData, `books/${asset.path}`);
            await platform.writeFile(dest, asset.bytes);
          }
          const mdPath = await getMdPath(bookId);
          await platform.writeFile(mdPath, new TextEncoder().encode(recovered.markdown));
          apply(recovered.markdown);
          Alert.alert(
            t("library.editor.restoredTitle", "Source restored"),
            t(
              "library.editor.restoredBody",
              "The Markdown source was restored from this document's EPUB.",
            ),
          );
          return;
        }
      } catch (err) {
        console.warn("[DocumentEditor] EPUB source recovery failed:", err);
      }

      if (!cancelled) {
        setIsReadOnly(true);
        setIsLoading(false);
        Alert.alert(
          t("library.editor.sourceMissingTitle", "Source missing"),
          t(
            "library.editor.sourceMissingBody",
            "The Markdown source could not be found or recovered. The document is read-only to avoid overwriting it; sync it from the device that imported it.",
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, t]);

  /** Write the document. Empty (or read-only) documents are never persisted. */
  const persist = useCallback(
    async (value: string, options?: { silent?: boolean }): Promise<boolean> => {
      if (readOnlyRef.current) return false;
      if (!value.trim()) return false;
      try {
        await saveDocument(bookId, value);
        lastSavedRef.current = value;
        return true;
      } catch (err) {
        console.warn("[DocumentEditor] Save failed:", err);
        if (!options?.silent) {
          Alert.alert(t("library.editor.saveError", "Save failed"), String(err));
        }
        return false;
      }
    },
    [bookId, saveDocument, t],
  );

  // Debounced auto-save driven by the value itself, so the timer always writes
  // the latest text (the previous closure-based debounce dropped the last edit).
  useEffect(() => {
    if (isLoading || isReadOnly) return;
    markdownRef.current = markdown;
    if (lastSavedRef.current === markdown) return;
    if (!markdown.trim()) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist(markdown, { silent: true });
    }, 3000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [markdown, isLoading, isReadOnly, persist]);

  // Auto-save on app background / inactive
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        if (isLoading || readOnlyRef.current) return; // skip save while loading/read-only
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        void persist(markdownRef.current, { silent: true });
      }
    });
    return () => {
      subscription.remove();
    };
  }, [persist, isLoading]);

  // Flush pending edits when leaving the screen (back button, tab switch, …).
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (readOnlyRef.current) return;
      const value = markdownRef.current;
      if (value.trim() && lastSavedRef.current !== value) {
        void persist(value, { silent: true });
      }
    };
  }, [persist]);

  const confirmAnnotationsMayShift = useCallback((): Promise<boolean> => {
    if (!hasAnnotations) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(
        t("editor.annotationsMayShiftTitle", "标注位置可能变化"),
        t(
          "editor.annotationsMayShift",
          "保存会重新生成该文档的 EPUB，已有高亮和笔记的位置可能发生偏移。仍要继续吗？",
        ),
        [
          { text: t("common.cancel", "取消"), style: "cancel", onPress: () => resolve(false) },
          { text: t("common.confirm", "确定"), onPress: () => resolve(true) },
        ],
      );
    });
  }, [hasAnnotations, t]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    if (isReadOnly) return;
    if (!markdown.trim()) {
      Alert.alert(
        t("library.editor.emptyTitle", "Cannot save"),
        t(
          "library.editor.emptyBody",
          "The document is empty. Write at least one line before saving.",
        ),
      );
      return;
    }
    if (!(await confirmAnnotationsMayShift())) return;
    setIsSaving(true);
    try {
      const saved = await persist(markdown);
      if (saved) Alert.alert("", t("library.editor.saved", "Saved"));
    } finally {
      setIsSaving(false);
    }
  }, [confirmAnnotationsMayShift, isSaving, isReadOnly, markdown, persist, t]);

  const handleToolbarAction = useCallback(
    (syntax: { prefix: string; suffix: string; placeholder: string }) => {
      const sel = selectionRef.current;
      const result = applyMarkdownSyntax(markdown, sel, syntax);
      setMarkdown(result.text);
      // Set cursor after the state update
      setTimeout(() => {
        inputRef.current?.setNativeProps({
          selection: { start: result.cursorPos, end: result.cursorPos },
        });
      }, 0);
    },
    [markdown],
  );

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
          {book?.meta.title || t("library.editor.title", "Edit Document")}
        </Text>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={async () => {
              // The reader opens the derived EPUB: persist pending edits first.
              if (!(await confirmAnnotationsMayShift())) return;
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              const saved = await persist(markdown, { silent: true });
              if (!saved && markdown.trim()) return;
              nav.navigate("Reader", { bookId });
            }}
          >
            <BookOpenIcon size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => setIsPreview(!isPreview)}>
            {isPreview ? (
              <EditIcon size={18} color={colors.mutedForeground} />
            ) : (
              <EyeIcon size={18} color={colors.mutedForeground} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerBtn, s.saveBtn, isReadOnly && { opacity: 0.4 }]}
            onPress={handleSave}
            disabled={isSaving || isReadOnly}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <CheckIcon size={18} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isReadOnly ? (
        <View style={s.readOnlyBanner}>
          <Text style={s.readOnlyBannerText}>
            {t(
              "library.editor.sourceMissingBody",
              "The Markdown source could not be found or recovered. The document is read-only to avoid overwriting it; sync it from the device that imported it.",
            )}
          </Text>
        </View>
      ) : null}

      {/* Toolbar */}
      {!isLoading && !isPreview && !isReadOnly ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.toolbar}
          contentContainerStyle={s.toolbarContent}
        >
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() => handleToolbarAction({ prefix: "**", suffix: "**", placeholder: "bold" })}
          >
            <Text style={[s.toolbarBtnText, { fontWeight: "700" }]}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() => handleToolbarAction({ prefix: "*", suffix: "*", placeholder: "italic" })}
          >
            <Text style={[s.toolbarBtnText, { fontStyle: "italic" }]}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() =>
              handleToolbarAction({ prefix: "\n# ", suffix: "", placeholder: "Heading 1" })
            }
          >
            <Text style={s.toolbarBtnText}>H1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() =>
              handleToolbarAction({ prefix: "\n## ", suffix: "", placeholder: "Heading 2" })
            }
          >
            <Text style={s.toolbarBtnText}>H2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() => handleToolbarAction({ prefix: "\n- ", suffix: "", placeholder: "item" })}
          >
            <Text style={s.toolbarBtnText}>•</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() =>
              handleToolbarAction({ prefix: "[", suffix: "](url)", placeholder: "text" })
            }
          >
            <Text style={s.toolbarBtnText}>🔗</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

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
            ref={inputRef}
            style={s.editor}
            value={markdown}
            onChangeText={setMarkdown}
            editable={!isReadOnly}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
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
      borderRadius: radius.full,
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
    readOnlyBanner: {
      paddingHorizontal: hPad,
      paddingVertical: 10,
      backgroundColor: withOpacity(colors.amber, 0.12),
      borderBottomWidth: 0.5,
      borderBottomColor: withOpacity(colors.amber, 0.35),
    },
    readOnlyBannerText: { fontSize: fontSize.xs, lineHeight: 18, color: colors.amber },
    toolbar: {
      maxHeight: 44,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
      backgroundColor: withOpacity(colors.muted, 0.3),
    },
    toolbarContent: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      gap: 2,
    },
    toolbarBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 36,
    },
    toolbarBtnText: {
      fontSize: 14,
      fontWeight: fontWeight.medium,
      color: colors.foreground,
    },
    errorText: {
      fontSize: fontSize.lg,
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 40,
    },
  });
