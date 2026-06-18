# VectorMatch Database Schema

```mermaid
erDiagram
    %% AUTH TABLES
    user {
        text id PK
        text name
        text email UK
        boolean emailVerified
        text image
        text role
        boolean banned
        text banReason
        timestamp banExpires
        timestamp createdAt
        timestamp updatedAt
    }

    account {
        text id PK
        text accountId
        text providerId
        text userId FK
        text accessToken
        text refreshToken
        text idToken
        timestamp accessTokenExpiresAt
        timestamp refreshTokenExpiresAt
        text scope
        text password
        timestamp createdAt
        timestamp updatedAt
    }

    session {
        text id PK
        timestamp expiresAt
        text token UK
        timestamp createdAt
        timestamp updatedAt
        text ipAddress
        text userAgent
        text impersonatedBy
        text userId FK
    }

    rate_limit {
        text id PK
        text key UK
        integer count
        bigint lastRequest
        timestamp expiresAt
        timestamp createdAt
    }

    verification {
        text id PK
        text identifier
        text value
        timestamp expiresAt
        timestamp createdAt
        timestamp updatedAt
    }

    %% BLOG TABLES (DEPRECATED - RETAINED FOR MIGRATION HISTORY)
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
        text userId FK
        varchar title
        varchar slug UK
        text shortDescription
        text content
        integer categoryId FK
        status status
        timestamp createdAt
        timestamp updatedAt
    }

    post_tags {
        integer postId PK,FK
        integer tagId PK,FK
    }

    comment {
        integer id PK
        integer parentId FK
        text userId FK
        text content
        integer postId FK
        timestamp createdAt
        timestamp updatedAt
    }

    %% JOBS TABLES
    applicant {
        text userId PK,FK
        boolean isOnboarded
        text country
        boolean canWorkUsHours
        assignment_type[] assignmentTypes
        modality[] modalities
        compliance[] preferredCompliance
        text[] allTags
        timestamp createdAt
        timestamp updatedAt
    }

    job {
        uuid id PK
        text atsSource
        text atsSlug
        text title
        text rawJson
        text[] extractedTags
        vector jobEmbedding
        timestamp detectedAt
    }

    persona {
        uuid id PK
        text applicantId FK
        text personaId
        text personaLabel
        text embeddingSummary
        vector personaEmbedding
        text[] mustHaveTags
        text[] blocklistTags
        timestamp createdAt
        timestamp updatedAt
    }

    match_queue {
        uuid id PK
        uuid jobId FK
        text applicantId FK
        integer overlapScore
        text status
        timestamp createdAt
    }

    %% RELATIONSHIPS - AUTH
    user ||--o{ account : "has"
    user ||--o{ session : "has"
    user ||--o{ applicant : "extends"
    user ||--o{ post : "writes"
    user ||--o{ comment : "writes"

    %% RELATIONSHIPS - BLOG
    category ||--o{ post : "categorizes"
    post ||--o{ post_tags : "has"
    tag ||--o{ post_tags : "assigned to"
    post ||--o{ comment : "receives"
    comment ||--o{ comment : "replies to"

    %% RELATIONSHIPS - JOBS
    applicant ||--o{ persona : "defines"
    applicant ||--o{ match_queue : "matched in"
    job ||--o{ match_queue : "matched in"
    persona ||--|| applicant : "belongs to"

    %% ENUMS
    enum assignment_type {
        remote
        hybrid
        on-site
        remote_local
    }

    enum modality {
        full-time
        part-time
        contract
        freelance
        internship
    }

    enum compliance {
        w2
        local_employment
        eor
        b2b
        1099
        w8ben
        ic_global
    }

    enum status {
        draft
        published
        archived
    }
```

## Schema Overview

### Authentication Tables
- **user**: Core user account with email verification, role management, and ban functionality
- **account**: OAuth provider accounts and password credentials
- **session**: User sessions with IP tracking and impersonation support
- **rate_limit**: Better Auth rate limiting for sliding-window algorithm
- **verification**: Email verification and password reset tokens

### Blog Tables (Deprecated)
These tables are retained for migration history only. The blog now uses static MDX files.
- **category**: Post categories
- **tag**: Post tags
- **post**: Blog posts with draft/published/archived status
- **post_tags**: Many-to-many relationship between posts and tags
- **comment**: Nested comment threads with parent-child relationships

### Jobs Tables
- **applicant**: User profile extended with job preferences, compliance options, and skill tags
- **job**: ATS-ingested job postings with extracted tags and vector embeddings
- **persona**: User-defined job personas with must-have/blocklist tags and vector embeddings
- **match_queue**: Job-applicant matching results with overlap scores and status tracking

## Key Indexes

### GIN Indexes (Tag Overlap - Gate 1)
- `jobs_extracted_tags_idx`: GIN index on job.extractedTags
- `persona_must_have_tags_idx`: GIN index on persona.mustHaveTags
- `persona_blocklist_tags_idx`: GIN index on persona.blocklistTags

### HNSW Indexes (Vector Similarity - Gate 2)
- `job_embedding_hnsw_idx`: HNSW index on job.jobEmbedding (cosine similarity)
- `persona_embedding_hnsw_idx`: HNSW index on persona.personaEmbedding (cosine similarity)

### Other Indexes
- `account_userId_idx`: Account lookups by user
- `session_userId_idx`: Session lookups by user
- `rate_limit_expires_at_idx`: Rate limit cleanup
- `verification_identifier_idx`: Token lookups
- `persona_applicant_id_idx`: Persona lookups by applicant
- `match_queue_unique`: Unique constraint on (jobId, applicantId)

## 3-Gate Matching Architecture

1. **Gate 1 (GIN Index)**: Tag overlap filtering using `must_have_tags` and `blocklist_tags`
2. **Gate 2 (HNSW Vector)**: Cosine similarity on persona embeddings vs job embeddings
3. **Gate 3 (LLM)**: GPT-4o arbitration using `embeddingSummary` and full context
