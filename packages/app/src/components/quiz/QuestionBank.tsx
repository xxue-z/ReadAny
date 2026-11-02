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
import { getQuestionBank } from "@readany/core/db/database";
import type { QuestionBankEntry, QuestionType } from "@readany/core/types";
import { BookOpen, Search, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "单选题",
  multi_choice: "多选题",
  true_false: "判断题",
  short_answer: "简答题",
};

const ALL_TAGS = [
  "vocabulary",
  "grammar",
  "comprehension",
  "inference",
  "summary",
  "detail",
  "theme",
  "character",
  "plot",
  "style",
];

export function QuestionBank() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<QuestionBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const q: { bookId?: string; tags?: string[]; type?: string } = {};
      if (typeFilter && typeFilter !== "all") q.type = typeFilter;
      if (tagFilter && tagFilter !== "all") q.tags = [tagFilter];
      const result = await getQuestionBank(q);
      setEntries(result);
    } catch (err) {
      console.error("[QuestionBank] Failed to load entries:", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, tagFilter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Client-side search filter
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const lower = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.tags.some((tg) => tg.toLowerCase().includes(lower)) || e.id.toLowerCase().includes(lower),
    );
  }, [entries, searchQuery]);

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

        {/* Tag filter */}
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder={t("quiz.tag")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("quiz.allTags")}</SelectItem>
            {ALL_TAGS.map((tg) => (
              <SelectItem key={tg} value={tg}>
                {tg}
              </SelectItem>
            ))}
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
                    {TYPE_LABELS[entry.questionType] ?? entry.questionType}
                  </Badge>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {entry.tags.map((tg) => (
                  <Badge key={tg} variant="secondary" className="text-[10px]">
                    <Tag className="mr-1 h-3 w-3" />
                    {tg}
                  </Badge>
                ))}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t("quiz.usageCount")}: {entry.usageCount}
                </span>
                <span>
                  {t("quiz.correctRate")}: {Math.round(entry.correctRate * 100)}%
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
