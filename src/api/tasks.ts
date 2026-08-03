import type {
  CreateTaskPayload,
  Task,
  TaskActivity,
  TaskComment,
  TaskDashboard,
  TaskGroup,
  TaskScope,
  TaskStatus,
  UpdateTaskPayload,
} from '@/types/api';
import { apiRequest } from './client';
import { asList } from './normalizers';

export interface GetTasksOptions {
  scope?: TaskScope;
  conversationId?: number;
  status?: TaskStatus | null;
  includeCompleted?: boolean;
  limit?: number;
}

function buildTaskQuery(options: GetTasksOptions = {}): string {
  const params = new URLSearchParams();
  if (options.scope) {
    params.set('scope', options.scope);
  }
  if (options.conversationId) {
    params.set('conversation_id', String(options.conversationId));
  }
  if (options.status) {
    params.set('status', options.status);
  }
  if (options.includeCompleted) {
    params.set('include_completed', 'true');
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getTasks(options: GetTasksOptions = {}): Promise<Task[]> {
  const response = await apiRequest<unknown>(`/tasks${buildTaskQuery(options)}`);
  return asList<Task>(response);
}

export async function getTask(taskId: number): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}`);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  return apiRequest<Task>('/tasks', { method: 'POST', body: payload });
}

export async function updateTask(taskId: number, payload: UpdateTaskPayload): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}`, { method: 'PUT', body: payload });
}

export async function completeTask(taskId: number, completed: boolean): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}/complete`, { method: 'POST', body: { completed } });
}

export async function deleteTask(taskId: number): Promise<void> {
  await apiRequest<unknown>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export async function addTaskAssignee(taskId: number, userId: number): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}/assignees`, { method: 'POST', body: { user_id: userId } });
}

export async function removeTaskAssignee(taskId: number, userId: number): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}/assignees/${userId}`, { method: 'DELETE' });
}

export async function addTaskWatcher(taskId: number, userId: number): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}/watchers`, { method: 'POST', body: { user_id: userId } });
}

export async function removeTaskWatcher(taskId: number, userId: number): Promise<Task> {
  return apiRequest<Task>(`/tasks/${taskId}/watchers/${userId}`, { method: 'DELETE' });
}

export async function getTaskActivities(taskId: number): Promise<TaskActivity[]> {
  const response = await apiRequest<unknown>(`/tasks/${taskId}/activities`);
  return asList<TaskActivity>(response);
}

export async function getActivities(conversationId?: number, limit = 60): Promise<TaskActivity[]> {
  const params = new URLSearchParams();
  if (conversationId) {
    params.set('conversation_id', String(conversationId));
  }
  params.set('limit', String(limit));
  const response = await apiRequest<unknown>(`/tasks/activities?${params.toString()}`);
  return asList<TaskActivity>(response);
}

export async function getTaskComments(taskId: number): Promise<TaskComment[]> {
  const response = await apiRequest<unknown>(`/tasks/${taskId}/comments`);
  return asList<TaskComment>(response);
}

export async function createTaskComment(taskId: number, content: string): Promise<TaskComment> {
  return apiRequest<TaskComment>(`/tasks/${taskId}/comments`, { method: 'POST', body: { content } });
}

export async function getTaskDashboard(): Promise<TaskDashboard> {
  return apiRequest<TaskDashboard>('/tasks/dashboard');
}

export async function getTaskGroups(): Promise<TaskGroup[]> {
  const response = await apiRequest<unknown>('/tasks/groups');
  return asList<TaskGroup>(response);
}

export async function createTaskGroup(name: string): Promise<TaskGroup> {
  return apiRequest<TaskGroup>('/tasks/groups', { method: 'POST', body: { name } });
}

export async function updateTaskGroup(groupId: number, name: string): Promise<TaskGroup> {
  return apiRequest<TaskGroup>(`/tasks/groups/${groupId}`, { method: 'PUT', body: { name } });
}

export async function deleteTaskGroup(groupId: number): Promise<void> {
  await apiRequest<unknown>(`/tasks/groups/${groupId}`, { method: 'DELETE' });
}

export async function moveTaskToGroup(taskId: number, groupId: number | null): Promise<void> {
  await apiRequest<unknown>(`/tasks/${taskId}/group`, { method: 'POST', body: { group_id: groupId } });
}
