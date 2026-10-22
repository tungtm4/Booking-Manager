/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export interface PaginationResult<T> {
  pageItems: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  isValidPage: boolean;
}

export function paginateItems<T>(
  items: T[],
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE
): PaginationResult<T> {
  const safeItems = Array.isArray(items) ? items : [];
  const totalItems = safeItems.length;
  const safePageSize = typeof pageSize === 'number' && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));

  const requestedPage = typeof page === 'number' && !isNaN(page) ? Math.floor(page) : 1;
  const isValidPage = requestedPage >= 1 && requestedPage <= totalPages;
  const clampedPage = Math.min(Math.max(1, requestedPage), totalPages);

  const startIndex = totalItems === 0 ? 0 : (clampedPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);
  const pageItems = totalItems === 0 ? [] : safeItems.slice(startIndex, endIndex);

  return {
    pageItems,
    page: clampedPage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    hasNext: clampedPage < totalPages,
    hasPrev: clampedPage > 1,
    isValidPage,
  };
}
