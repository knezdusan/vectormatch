# Database Schema - Entity Relationship Diagram

```mermaid
erDiagram
    %% AUTH TABLES
    user ||--o{ account : "has"
    user ||--o{ session : "has"
    user ||--o{ verification : "has"
    user ||--o{ post : "creates"
    user ||--o{ comment : "writes"

    account {
        text id PK
        text account_id
        text provider_id
        text user_id FK
        text access_token
        text refresh_token
        text id_token
        timestamp access_token_expires_at
        timestamp refresh_token_expires_at
        text scope
        text password
        timestamp created_at
        timestamp updated_at
    }

    session {
        text id PK
        timestamp expires_at
        text token UK
        timestamp created_at
        timestamp updated_at
        text ip_address
        text user_agent
        text impersonated_by
        text user_id FK
    }

    user {
        text id PK
        text name
        text email UK
        boolean email_verified
        text image
        text role
        boolean banned
        text ban_reason
        timestamp ban_expires
        timestamp created_at
        timestamp updated_at
    }

    rate_limit {
        text id PK
        text key UK
        integer count
        bigint last_request
        timestamp expires_at
        timestamp created_at
    }

    verification {
        text id PK
        text identifier
        text value
        timestamp expires_at
        timestamp created_at
        timestamp updated_at
    }

    %% BLOG TABLES
    category ||--o{ post : "categorizes"
    tag ||--o{ post_tags : "used in"
    post ||--o{ post_tags : "has"
    post ||--o{ comment : "receives"
    post_tags {
        integer post_id FK, PK
        integer tag_id FK, PK
    }

    category {
        integer id PK
        varchar name UK
    }

    tag {
        integer id PK
        varchar name UK
    }

    post {
        integer id PK
        text user_id FK
        varchar title
        varchar slug UK
        text short_description
        text content
        integer category_id FK
        status status
        timestamp created_at
        timestamp updated_at
    }

    comment {
        integer id PK
        integer parent_id FK
        text user_id FK
        text content
        integer post_id FK
        timestamp created_at
        timestamp updated_at
    }

    %% ENUM
    enum status {
        draft
        published
        archived
    }
```

## Table Relationships

### Authentication Flow
- **user** → **account**: One user can have multiple OAuth accounts
- **user** → **session**: One user can have multiple active sessions
- **user** → **verification**: One user can have multiple verification tokens

### Blog System
- **user** → **post**: One user can create multiple posts
- **category** → **post**: One category can contain multiple posts
- **post** ↔ **tag**: Many-to-many relationship via post_tags junction table
- **post** → **comment**: One post can have multiple comments
- **comment** → **comment**: Self-referencing for nested replies (parent_id)

### Cascade Rules
- **ON DELETE CASCADE**: user → account, session, post, comment
- **ON DELETE SET NULL**: post → category, comment → parent comment
- **ON DELETE CASCADE**: post_tags → post, tag

## Indexes
- `account_userId_idx` on account(user_id)
- `session_userId_idx` on session(user_id)
- `rate_limit_expires_at_idx` on rate_limit(expires_at)
- `verification_identifier_idx` on verification(identifier)
