const ANNOUNCEMENT_PREFIX = "[[ANNOUNCEMENT]]";
const QUESTION_PREFIX = "[[QUESTION]]";
const POLL_PREFIX = "[[POLL]]";
const FORUM_TOPIC_PREFIX = "[[FORUM_TOPIC]]";

export type PollDefinition = {
  question: string;
  options: string[];
  multipleChoice?: boolean;
  expiresAt?: string | null;
};

export type ForumTopicDefinition = {
  title: string;
  body: string;
};

export type ParsedMessage =
  | { kind: "plain"; text: string }
  | { kind: "announcement"; text: string }
  | { kind: "question"; text: string }
  | { kind: "poll"; poll: PollDefinition }
  | { kind: "forum_topic"; topic: ForumTopicDefinition };

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const encodeAnnouncement = (text: string) => `${ANNOUNCEMENT_PREFIX}${text}`;
export const encodeQuestion = (text: string) => `${QUESTION_PREFIX}${text}`;
export const encodePoll = (poll: PollDefinition) => `${POLL_PREFIX}${JSON.stringify(poll)}`;
export const encodeForumTopic = (topic: ForumTopicDefinition) => `${FORUM_TOPIC_PREFIX}${JSON.stringify(topic)}`;

export const parseMessageFeatures = (content: string): ParsedMessage => {
  if (content.startsWith(ANNOUNCEMENT_PREFIX)) {
    return { kind: "announcement", text: content.slice(ANNOUNCEMENT_PREFIX.length).trim() };
  }
  if (content.startsWith(QUESTION_PREFIX)) {
    return { kind: "question", text: content.slice(QUESTION_PREFIX.length).trim() };
  }
  if (content.startsWith(POLL_PREFIX)) {
    const raw = content.slice(POLL_PREFIX.length).trim();
    const parsed = safeJsonParse(raw);
    if (
      parsed
      && typeof parsed === "object"
      && typeof (parsed as PollDefinition).question === "string"
      && Array.isArray((parsed as PollDefinition).options)
    ) {
      const poll = parsed as PollDefinition;
      const options = poll.options.filter((opt): opt is string => typeof opt === "string").map((opt) => opt.trim()).filter(Boolean);
      if (options.length >= 2) {
        return {
          kind: "poll",
          poll: {
            question: poll.question.trim(),
            options,
            multipleChoice: !!poll.multipleChoice,
            expiresAt: poll.expiresAt || null,
          },
        };
      }
    }
  }
  if (content.startsWith(FORUM_TOPIC_PREFIX)) {
    const raw = content.slice(FORUM_TOPIC_PREFIX.length).trim();
    const parsed = safeJsonParse(raw);
    if (
      parsed
      && typeof parsed === "object"
      && typeof (parsed as ForumTopicDefinition).title === "string"
      && typeof (parsed as ForumTopicDefinition).body === "string"
    ) {
      const topic = parsed as ForumTopicDefinition;
      const title = topic.title.trim();
      const body = topic.body.trim();
      if (title) {
        return {
          kind: "forum_topic",
          topic: {
            title,
            body: body || title,
          },
        };
      }
    }
  }
  return { kind: "plain", text: content };
};
