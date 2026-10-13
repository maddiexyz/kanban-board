import type {
  AuthResponse,
  User,
  Workspace,
  WorkspaceDetail,
  Board,
  Column,
  Card,
} from "../types";

let currentToken: string | null = localStorage.getItem("kanban_access_token");

export function getStoredToken(): string | null {
  return currentToken;
}

export function setStoredToken(token: string | null): void {
  currentToken = token;
  if (token) {
    localStorage.setItem("kanban_access_token", token);
  } else {
    localStorage.removeItem("kanban_access_token");
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (currentToken) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: "include", // pass HttpOnly refresh cookies
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || JSON.stringify(errJson);
    } catch {
      // ignore
    }
    const error: any = new Error(errorDetail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// -------------------------------------------------------------
// Authentication API
// -------------------------------------------------------------
export const authApi = {
  async register(
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthResponse> {
    const res = await request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    setStoredToken(res.access_token);
    return res;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>("/api/auth/token", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.access_token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      setStoredToken(null);
    }
  },

  async getMe(): Promise<User> {
    return request<User>("/api/auth/me");
  },

  async updateMe(displayName: string): Promise<User> {
    return request<User>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ display_name: displayName }),
    });
  },

  async refresh(): Promise<AuthResponse> {
    const res = await request<AuthResponse>("/api/auth/refresh", {
      method: "POST",
    });
    setStoredToken(res.access_token);
    return res;
  },
};

// -------------------------------------------------------------
// Workspaces API
// -------------------------------------------------------------
export const workspaceApi = {
  async list(): Promise<Workspace[]> {
    return request<Workspace[]>("/api/workspaces");
  },

  async create(name: string): Promise<Workspace> {
    return request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  async update(id: string, name: string): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async delete(id: string): Promise<void> {
    return request(`/api/workspaces/${id}`, { method: "DELETE" });
  },

  async getDetail(id: string): Promise<WorkspaceDetail> {
    return request<WorkspaceDetail>(`/api/workspaces/${id}`);
  },

  async addMember(
    workspaceId: string,
    email: string,
    role: "admin" | "member" = "member"
  ): Promise<any> {
    return request(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    return request(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    });
  },
};

// -------------------------------------------------------------
// Boards API
// -------------------------------------------------------------
export const boardApi = {
  async list(workspaceId: string): Promise<Board[]> {
    return request<Board[]>(`/api/workspaces/${workspaceId}/boards`);
  },

  async create(workspaceId: string, title: string): Promise<Board> {
    return request<Board>(`/api/workspaces/${workspaceId}/boards`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  async getDetail(boardId: string): Promise<Board> {
    return request<Board>(`/api/boards/${boardId}`);
  },

  async update(boardId: string, title: string): Promise<Board> {
    return request<Board>(`/api/boards/${boardId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  async delete(boardId: string): Promise<void> {
    return request(`/api/boards/${boardId}`, { method: "DELETE" });
  },
};

// -------------------------------------------------------------
// Columns API
// -------------------------------------------------------------
export const columnApi = {
  async create(
    boardId: string,
    title: string,
    prevRank?: string | null,
    nextRank?: string | null
  ): Promise<Column> {
    return request<Column>(`/api/boards/${boardId}/columns`, {
      method: "POST",
      body: JSON.stringify({
        title,
        prev_rank: prevRank,
        next_rank: nextRank,
      }),
    });
  },

  async update(columnId: string, title: string): Promise<Column> {
    return request<Column>(`/api/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  async delete(columnId: string): Promise<void> {
    return request(`/api/columns/${columnId}`, { method: "DELETE" });
  },

  async rebalance(columnId: string): Promise<void> {
    return request(`/api/columns/${columnId}/rebalance`, { method: "POST" });
  },
};

// -------------------------------------------------------------
// Cards API
// -------------------------------------------------------------
export const cardApi = {
  async create(
    columnId: string,
    title: string,
    description?: string,
    assigneeId?: string | null,
    position: "start" | "end" = "end"
  ): Promise<Card> {
    return request<Card>(`/api/columns/${columnId}/cards`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        assignee_id: assigneeId || null,
        position,
      }),
    });
  },

  async update(
    cardId: string,
    title?: string,
    description?: string,
    assigneeId?: string | null
  ): Promise<Card> {
    const body: Record<string, any> = {};
    if (title !== undefined) body.title = title;
    if (description !== undefined) body.description = description;
    if (assigneeId !== undefined) body.assignee_id = assigneeId;

    return request<Card>(`/api/cards/${cardId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  async delete(cardId: string): Promise<void> {
    return request(`/api/cards/${cardId}`, { method: "DELETE" });
  },

  async move(
    cardId: string,
    payload: {
      target_column_id?: string;
      rank?: string;
      prev_rank?: string | null;
      next_rank?: string | null;
      version?: number;
    }
  ): Promise<Card> {
    return request<Card>(`/api/cards/${cardId}/move`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
