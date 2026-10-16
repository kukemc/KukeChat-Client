import { announcementReactionsMock } from './announcementReactions';
import { birthdayMock } from './birthday';
import { emojisMock } from './emojis';
import { giftsMock } from './gifts';
import { groupPlusMock } from './groupPlus';
import { levelMock } from './level';
import { pokeMock } from './poke';
import { pollsMock } from './polls';
import { profileLikesMock } from './profileLikes';
import { redPacketsMock } from './redPackets';
import { shopMock } from './shop';
import { typingMock } from './typing';
import type { MockHandler } from './types';

// pokeMock 要排在 typingMock 前面：两边都接 PATCH /users/me，前者只认带戳一戳字段的请求。
// groupPlusMock 放最后：它只在预览页调过 initGroupPlusMock 之后才响应，别的预览页不受影响。
// birthdayMock（/users/me/birthday）、giftsMock（/gifts 和 /users/{id}/gifts）只认自己的路径，排在最前面
export const featureMocks: MockHandler[] = [birthdayMock, giftsMock, pokeMock, pollsMock, typingMock, emojisMock, announcementReactionsMock, shopMock, redPacketsMock, levelMock, profileLikesMock, groupPlusMock];
