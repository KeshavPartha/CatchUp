'use client';

import Link from 'next/link';
import { Loader2, Play, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';

import type { Episode } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/client';
import {
  requestRecap,
  requestRecapQuestion,
  RecapClientAuthenticationError,
  RecapClientRequestError,
} from '@/lib/recaps/client';

interface CatchMeUpButtonProps {
  showId: number;
  targetEpisode: Episode;
  compact?: boolean;
  isResume?: boolean;
}

type RecapState = 'idle' | 'loading' | 'success' | 'unauthenticated' | 'error';
type QuestionState = 'idle' | 'loading' | 'error';

interface QuestionAnswer {
  question: string;
  answer: string;
}

export function CatchMeUpButton({
  showId,
  targetEpisode,
  compact = false,
  isResume = false,
}: CatchMeUpButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RecapState>('idle');
  const [recap, setRecap] = useState('');
  const [question, setQuestion] = useState('');
  const [questionState, setQuestionState] = useState<QuestionState>('idle');
  const [questionError, setQuestionError] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');
  const [questionHistory, setQuestionHistory] = useState<QuestionAnswer[]>([]);
  const titleId = useId();
  const questionInputId = useId();

  const loadRecap = useCallback(async () => {
    setState('loading');
    setRecap('');

    try {
      const supabase = createClient();
      const result = await requestRecap({
        showId,
        targetEpisodeId: targetEpisode.id,
        getAccessToken: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          return session?.access_token ?? null;
        },
      });
      setRecap(result.recap);
      setState('success');
    } catch (error) {
      if (error instanceof RecapClientAuthenticationError) {
        setState('unauthenticated');
      } else if (error instanceof RecapClientRequestError) {
        setState('error');
      } else {
        setState('error');
      }
    }
  }, [showId, targetEpisode.id]);

  const askQuestion = useCallback(
    async (questionText: string) => {
      setQuestionState('loading');
      setQuestionError('');
      setLastQuestion(questionText);

      try {
        const supabase = createClient();
        const result = await requestRecapQuestion({
          showId,
          targetEpisodeId: targetEpisode.id,
          question: questionText,
          getAccessToken: async () => {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            return session?.access_token ?? null;
          },
        });
        setQuestionHistory((history) => [
          ...history,
          { question: questionText, answer: result.answer },
        ]);
        setQuestionState('idle');
        setLastQuestion('');
      } catch (error) {
        setQuestionState('error');
        setQuestionError(
          error instanceof RecapClientAuthenticationError
            ? 'Your session expired. Sign in again to ask a question.'
            : 'Catch Me Up could not answer that right now.'
        );
      }
    },
    [showId, targetEpisode.id]
  );

  useEffect(() => {
    if (!open) return;
    void loadRecap();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [loadRecap, open]);

  const openModal = () => {
    setQuestion('');
    setQuestionState('idle');
    setQuestionError('');
    setLastQuestion('');
    setQuestionHistory([]);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const submitQuestion = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const questionText = question.trim();
    if (!questionText || questionState === 'loading') return;
    setQuestion('');
    void askQuestion(questionText);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={`Catch me up before ${targetEpisode.name}`}
        className={
          compact
            ? 'inline-flex items-center gap-2 rounded border border-white/40 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-white/10'
            : 'inline-flex items-center gap-2 rounded border border-white/50 bg-black/20 px-5 py-2 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white/20'
        }
      >
        <Sparkles className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
        Catch Me Up
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-xl rounded-xl border border-white/10 bg-[#181818] p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-netflix-lightGray">
                  Before Season {targetEpisode.season_number} Episode {targetEpisode.episode_number}
                </p>
                <h2 id={titleId} className="text-2xl font-bold sm:text-3xl">
                  Catch Me Up
                </h2>
                <p className="mt-2 text-sm text-netflix-lightGray">{targetEpisode.name}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close Catch Me Up"
                autoFocus
                className="rounded-full p-2 text-netflix-lightGray transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-8 min-h-40" aria-live="polite">
              {state === 'loading' && (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-netflix-red" aria-hidden="true" />
                  <p className="text-netflix-lightGray">
                    Gathering the important moments you’ve already watched…
                  </p>
                </div>
              )}

              {state === 'success' && (
                <div>
                  <p className="whitespace-pre-line leading-relaxed text-white">{recap}</p>
                  <Link
                    href={`/tv/${showId}/episode/${targetEpisode.id}`}
                    onClick={close}
                    className="mt-7 inline-flex items-center gap-2 rounded bg-white px-5 py-2.5 font-semibold text-black transition-colors hover:bg-white/90"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {isResume ? 'Resume episode' : 'Start episode'}
                  </Link>

                  <div className="mt-8 border-t border-white/10 pt-6">
                    <form onSubmit={submitQuestion}>
                      <label htmlFor={questionInputId} className="text-sm font-semibold text-white">
                        Ask about what you’ve watched
                      </label>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          id={questionInputId}
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder="Who is Ilya?"
                          maxLength={1000}
                          disabled={questionState === 'loading'}
                          className="min-w-0 flex-1 rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-netflix-lightGray focus:border-white/60 disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={!question.trim() || questionState === 'loading'}
                          className="inline-flex items-center justify-center gap-2 rounded bg-netflix-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {questionState === 'loading' ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Send className="h-4 w-4" aria-hidden="true" />
                          )}
                          Ask
                        </button>
                      </div>
                    </form>

                    {questionState === 'error' && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-100">
                        <p>{questionError}</p>
                        {lastQuestion && (
                          <button
                            type="button"
                            onClick={() => void askQuestion(lastQuestion)}
                            className="inline-flex items-center gap-2 rounded border border-white/30 px-3 py-1.5 font-semibold transition-colors hover:bg-white/10"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                          </button>
                        )}
                      </div>
                    )}

                    {questionHistory.length > 0 && (
                      <div className="mt-6 space-y-4" aria-live="polite">
                        {questionHistory.map((item, index) => (
                          <div key={`${item.question}-${index}`} className="space-y-2">
                            <p className="text-sm font-semibold text-white">{item.question}</p>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-netflix-lightGray">
                              {item.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {state === 'unauthenticated' && (
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-netflix-lightGray">
                  Sign in to CatchUp to use spoiler-safe recaps based on your watch progress.
                </div>
              )}

              {state === 'error' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm text-red-100">
                    Catch Me Up could not be generated right now.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadRecap()}
                    className="mt-4 inline-flex items-center gap-2 rounded border border-white/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/10"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={close}
                className="rounded px-4 py-2 text-sm font-semibold text-netflix-lightGray transition-colors hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
