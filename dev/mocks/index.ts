import { announcementReactionsMock } from './announcementReactions';
import { emojisMock } from './emojis';
import { levelMock } from './level';
import { pokeMock } from './poke';
import { pollsMock } from './polls';
import { profileLikesMock } from './profileLikes';
import { shopMock } from './shop';
import { typingMock } from './typing';
import type { MockHandler } from './types';

// pokeMock 要排在 typingMock 前面：两边都接 PATCH /users/me，前者只认带戳一戳字段的请求
export const featureMocks: MockHandler[] = [pokeMock, pollsMock, typingMock, emojisMock, announcementReactionsMock, shopMock, levelMock, profileLikesMock];
