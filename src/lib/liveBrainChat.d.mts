export declare const liveBrainAnswerRowId: (generationId: number) => string;
export declare const liveBrainQuestionRowId: (questionId: string) => string;

export declare function placeLiveBrainQuestion<M extends { id: string; role: string; text: string; isStreaming?: boolean }>(
  messages: M[],
  question: { questionId: string; text: string; done: boolean; generationId?: number },
): M[];

export declare function replaceLiveBrainAnswer<M>(
  messages: M[],
  generationId: number,
  replacement: import('../types/whatToAnswerQuestion').LiveBrainReplacement,
): M[];
export declare function keepsPartialOnDiscard(reason: string | undefined): boolean;
