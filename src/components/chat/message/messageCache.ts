import type { Message } from '@/types/api';
import type { MessagesInfiniteData } from './types';
import { MESSAGE_PAGE_SIZE } from './constants';

export function patchMessageInPages(data: MessagesInfiniteData | undefined, messageId: number, updater: (message: Message) => Message): MessagesInfiniteData | undefined {
  if (!data) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => page.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    changed = true;
    return updater(message);
  }));
  return changed ? { ...data, pages } : data;
}

export function upsertMessageIntoFirstPage(data: MessagesInfiniteData | undefined, message: Message): MessagesInfiniteData | undefined {
  if (!data || data.pages.length === 0) {
    return data;
  }

  let exists = false;
  const pages = data.pages.map((page) => page.map((item) => {
    if (item.id !== message.id) {
      return item;
    }
    exists = true;
    return { ...item, ...message };
  }));

  if (exists) {
    return { ...data, pages };
  }

  return {
    ...data,
    pages: [[...data.pages[0], message].sort((a, b) => a.id - b.id), ...data.pages.slice(1)]
  };
}

export function replaceMessagesWithContextPage(messages: Message[], pageSize: number = MESSAGE_PAGE_SIZE): MessagesInfiniteData {
  const uniqueMessages = Array.from(new Map(messages.map((message) => [message.id, message])).values()).sort((a, b) => a.id - b.id);
  return {
    pages: [uniqueMessages],
    pageParams: [uniqueMessages.length >= pageSize ? uniqueMessages[0]?.id : undefined]
  };
}

export function appendNewerMessagesIntoFirstPage(data: MessagesInfiniteData | undefined, messages: Message[]): MessagesInfiniteData | undefined {
  if (!data || data.pages.length === 0 || messages.length === 0) {
    return data;
  }

  const firstPage = data.pages[0] ?? [];
  const mergedFirstPage = Array.from(new Map([...firstPage, ...messages].map((message) => [message.id, message])).values()).sort((a, b) => a.id - b.id);
  return {
    ...data,
    pages: [mergedFirstPage, ...data.pages.slice(1)]
  };
}
