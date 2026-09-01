import { queryOptions } from '@tanstack/react-query'
import { ApiProtocolError, type ApiClient } from '@/shared/api/client'

export const rolesQueryKey = ['access', 'roles'] as const
export const roleQueryKey = (id: string) => ['access', 'roles', id] as const
export const usersQueryKey = (cursor = '') => ['access', 'users', cursor] as const
export const invitationsQueryKey = (cursor = '') => ['access', 'invitations', cursor] as const

const missingMethod = () => Promise.reject(new ApiProtocolError('This API client does not expose access management.'))

export function rolesOptions(api: ApiClient) {
  return queryOptions({
    queryKey: rolesQueryKey,
    queryFn: ({ signal }) => api.getRoles ? api.getRoles(signal) : missingMethod(),
    retry: false,
    staleTime: 10_000,
  })
}

export function roleOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: roleQueryKey(id),
    queryFn: ({ signal }) => api.getRole ? api.getRole(id, signal) : missingMethod(),
    retry: false,
  })
}

export function usersOptions(api: ApiClient, cursor = '') {
  return queryOptions({
    queryKey: usersQueryKey(cursor),
    queryFn: ({ signal }) => api.getUsers ? api.getUsers({ cursor: cursor || undefined }, signal) : missingMethod(),
    retry: false,
  })
}

export function invitationsOptions(api: ApiClient, cursor = '') {
  return queryOptions({
    queryKey: invitationsQueryKey(cursor),
    queryFn: ({ signal }) => api.getInvitations ? api.getInvitations({ cursor: cursor || undefined }, signal) : missingMethod(),
    retry: false,
  })
}
