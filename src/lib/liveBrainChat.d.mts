export declare const liveBrainAnswerRowId: (generationId: number) => string;
export declare const liveBrainQuestionRowId: (questionId: string) => string;

export declare function placeLiveBrainQuestion<M extends { id: string; role: string; text: string; isStreaming?: boolean }>(
  messages: M[],
  question: { questionId: string; text: string; done: boolean; generationId?: number },
): M[];
