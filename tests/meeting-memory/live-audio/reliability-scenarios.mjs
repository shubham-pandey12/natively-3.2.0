// Short real-device interview cases. Audio still travels through the selected
// BlackHole endpoints and Natively's configured STT provider.
export const RELIABILITY_SCENARIOS = [
  {
    id: 'normal-question',
    turns: [{ who: 'interviewer', text: 'How do you decide when to add a cache to a service?' }],
    expectedTerms: ['decide', 'cache', 'service'],
  },
  {
    id: 'long-technical-question',
    turns: [{ who: 'interviewer', text: 'Imagine a payment service that processes twelve thousand requests per second. How would you design idempotency keys, retries, partitioning, and observability so a network interruption cannot create duplicate charges?' }],
    expectedTerms: ['payment', 'idempotency', 'retries', 'partitioning', 'observability'],
  },
  {
    id: 'pause-before-completion',
    turns: [
      { who: 'interviewer', text: 'How would you handle a deployment that starts failing halfway through' },
      { pauseMs: 2500 },
      { who: 'interviewer', text: 'and how would you safely roll it back?' },
    ],
    expectedTerms: ['deployment', 'failing', 'roll', 'back'],
  },
  {
    id: 'fast-speech',
    turns: [{ who: 'interviewer', wpm: 250, text: 'What tradeoffs do you consider when choosing synchronous calls over an event queue?' }],
    expectedTerms: ['tradeoffs', 'synchronous', 'event', 'queue'],
  },
  {
    id: 'background-noise',
    turns: [{ who: 'interviewer', noise: true, text: 'How would you detect and recover from a slow database replica?' }],
    expectedTerms: ['detect', 'recover', 'database', 'replica'],
  },
  {
    id: 'follow-up-context',
    turns: [
      { who: 'interviewer', text: 'Our ledger uses Kafka partitions keyed by merchant, and the team has six engineers.' },
      { who: 'user', text: 'I would drain the old partition before changing the key mapping.' },
      { who: 'interviewer', text: 'What risk does increasing the partition count create for that merchant ordering?' },
    ],
    expectedTerms: ['partition', 'merchant', 'ordering'],
    answerQuestion: 'What risk does increasing the partition count create for that merchant ordering?',
    answerTerms: ['partition', 'ordering'],
  },
  {
    id: 'interviewer-interruption',
    overlap: [
      { who: 'interviewer', text: 'Before you finish, how would you measure the migration risk?' },
      { who: 'user', text: 'I would compare balances and keep a rollback path.' },
    ],
    expectedTerms: ['migration', 'risk', 'balances', 'rollback'],
    speakers: ['interviewer', 'user'],
  },
];

// Physical endpoint removal is intentionally an operator-run check. BlackHole
// is virtual and cannot be unplugged to exercise CoreAudio device loss.
export const PHYSICAL_DISCONNECTION_SCENARIO = {
  id: 'audio-device-disconnection',
  expected: 'Capture reports the selected endpoint loss, recovers after reconnection, and resumes transcript delivery.',
};
