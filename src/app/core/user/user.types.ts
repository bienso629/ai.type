export interface User {
    id: string;
    name: string;
    email: string;
    server: string;
    avatar?: string;
    postcount?: number;
    reputation?: number;
    status?: string;
    groups?: string[];
}
