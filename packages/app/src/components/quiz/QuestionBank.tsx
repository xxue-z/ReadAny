/**
 * QuestionBank — filterable grid of existing question bank entries.
 */
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLibraryStore } from "@/stores/library-store";
import { getQuestionBank } from "@readany/core/db/database";
import type { QuestionBankEntry, QuestionType } from "@readany/core/types";
import { BookOpen, Search, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const TYPE_LABEL_KEYS: Record<QuestionType, string> = {
  single_choice: "quiz.singleChoice",
  multi_choice: "quiz.multiChoice",
  true_false: "quiz.trueFalse",
  short_answer: "quiz.shortAnswer",
};

/** Accuracy buckets shown in the filter (client-side on the loaded page). */
type AccuracyFilter = "all" | "never" | "low" | "mid" | "high";

export function QuestionBank() {
  const { t } = useTranslation();
  const books = useLibraryStore((s) => s.books);
  const [entries, setEntries] = useState<QuestionBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Book/type filtering happens in SQL; tag/accuracy/search are applied locally
  // so the tag list can be derived from what is actually in the bank.
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const query: { bookId?: string; type?: string } = {};
      if (typeFilter && typeFilter !== "all") query.type = typeFilter;
      if (bookFilter && bookFilter !== "all") query.bookId = bookFilter;
      setEntries(await getQuestionBank(query));
    } catch (err) {
      console.error("[QuestionBank] Failed to load entries:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, bookFilter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const lower = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (tagFilter !== "all" && !entry.tags.includes(tagFilter)) return false;

      if (accuracyFilter !== "all") {
        const rate = entry.correctRate;
        const attempted = entry.usageCount > 0 && rate !== undefined;
        if (accuracyFilter === "never" && attempted) return false;
        if (accuracyFilter !== "never") {
          if (!attempted || rate === undefined) return false;
          if (accuracyFilter === "low" && rate >= 0.5) return false;
          if (accuracyFilter === "mid" && (rate < 0.5 || rate >= 0.8)) return false;
          if (accuracyFilter === "high" && rate < 0.8) return false;
        }
      }

      if (!lower) return true;
      const haystack = [entry.stem ?? "", entry.questionId, ...entry.tags].join(" ").toLowerCase();
      return haystack.includes(lower);
    });
  }, [entries, searchQuery, tagFilter, accuracyFilter]);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-60">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("quiz.searchQuestions")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>

        {/* Book filter */}
        <Select value={bookFilter} onValueChange={setBookFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder={t("quiz.filterBook", "Book")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allBooks")}</SelectItem>
            {books.map((book) => (
              <SelectItem key={book.id} value={String(book.id)}>
                {book.meta.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder={t("quiz.questionType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allTypes")}</SelectItem>
            <SelectItem value="single_choice">{t("quiz.singleChoice")}</SelectItem>
            <SelectItem value="multi_choice">{t("quiz.multiChoice")}</SelectItem>
            <SelectItem value="true_false">{t("quiz.trueFalse")}</SelectItem>
            <SelectItem value="short_answer">{t("quiz.shortAnswer")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Tag filter (derived from the bank) */}
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder={t("quiz.tag")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allTags")}</SelectItem>
            {tagOptions.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Accuracy filter */}
        <Select
          value={accuracyFilter}
          onValueChange={(value) => setAccuracyFilter(value as AccuracyFilter)}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder={t("quiz.accuracyFilter", "Correct rate")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allAccuracies", "Any accuracy")}</SelectItem>
            <SelectItem value="never">{t("quiz.accuracyNever", "Never graded")}</SelectItem>
            <SelectItem value="low">{t("quiz.accuracyLow", "< 50%")}</SelectItem>
            <SelectItem value="mid">{t("quiz.accuracyMid", "50% – 80%")}</SelectItem>
            <SelectItem value="high">{t("quiz.accuracyHigh", "≥ 80%")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Count */}
        <span className="text-xs text-muted-foreground">
          {filteredEntries.length} {t("quiz.questions")}
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t("quiz.noQuestions")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
            >
              {/* Stem + type (joined from quiz_questions) */}
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-medium text-foreground line-clamp-3">
                  {entry.stem || entry.questionId}
                </p>
                {entry.questionType && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t(TYPE_LABEL_KEYS[entry.questionType] ?? entry.questionType)}
                  </Badge>
                )}
              </div>

              {/* Tags */}
              {entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      <Tag className="mr-1 h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t("quiz.usageCount")}: {entry.usageCount}
                </span>
                <span>
                  {t("quiz.correctRate")}:{" "}
                  {entry.correctRate === undefined
                    ? t("quiz.notGraded", "—")
                    : `${Math.round(entry.correctRate * 100)}%`}
                </span>
                {entry.difficulty != null && (
                  <span>
                    {t("quiz.difficulty")}: {entry.difficulty}
                  </span>
                )}
              </div>

              {/* Variant indicator */}
              {entry.variantOf && (
                <div className="text-[10px] text-muted-foreground">
                  {t("quiz.variantOf")}: {entry.variantOf.slice(0, 8)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
