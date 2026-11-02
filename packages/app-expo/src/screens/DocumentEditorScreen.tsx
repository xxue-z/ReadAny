import { CheckIcon, ChevronLeftIcon, EyeIcon, EditIcon } from "@/components/ui/Icon";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
      cursorPos: selection.start + syntax.prefix.length + selectedText.length + syntax.suffix.length,
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
  const updateBook = useLibraryStore((s) => s.updateBook);

  const [markdown, setMarkdown] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPreview, setIsPreview] = useState(route.params.initialPreview ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const s = useMemo(() => makeStyles(colors, layout.horizontalPadding), [colors, layout]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let errMsg = "";
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
  }, [bookId]);

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
              <CheckIcon size={18} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Toolbar */}
      {!isLoading && !isPreview ? (
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
            onPress={() => handleToolbarAction({ prefix: "\n# ", suffix: "", placeholder: "Heading 1" })}
          >
            <Text style={s.toolbarBtnText}>H1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={() => handleToolbarAction({ prefix: "\n## ", suffix: "", placeholder: "Heading 2" })}
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
            onPress={() => handleToolbarAction({ prefix: "[", suffix: "](url)", placeholder: "text" })}
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
