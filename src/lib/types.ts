export type Bookmark = {
  id: string
  url: string
  title: string
  description: string
  image: string
  favicon: string
  siteName: string
  branchId: string | null
  createdAt: number
  updatedAt: number
  readAt: number | null
  archived: boolean
}

export type Branch = {
  id: string
  name: string
  description: string
  parentId: string | null
  createdAt: number
}
