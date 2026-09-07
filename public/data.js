/**
 * data.js
 * ------------------------------------------------------------------
 * Placeholder graph data for the ERD viewer, isolated from index.html.
 *
 * This is NOT real data. It is an obviously-fake sample schema shown
 * before a live Postgres database is selected, purely so the viewer
 * has something to render and so the pan/zoom/grouping controls have
 * something to act on. Every table and column name is prefixed with
 * `demo_` / `sample` on purpose so it can never be mistaken for a real
 * schema.
 *
 * Exposes a single global `data` object (loaded via a classic
 * <script> tag before index.html's module script runs):
 *
 *   data.placeholderDiagram - Mermaid erDiagram definition (sample ERD)
 *   data.fkTargets           - { fieldName: targetTableName } map used
 *                              to wire clickable foreign-key navigation
 *
 * Once a database is picked from the dropdown the viewer swaps this out
 * for the live introspected schema (see GET /api/schema in server.js).
 * ------------------------------------------------------------------
 */
const data = {
  placeholderDiagram: `erDiagram
    demo_customers ||--o{ demo_orders : "places"
    demo_orders ||--o{ demo_order_items : "contains"
    demo_products ||--o{ demo_order_items : "listed in"
    demo_customers ||--o{ demo_addresses : "has"
    demo_products ||--o{ demo_reviews : "receives"
    demo_customers ||--o{ demo_reviews : "writes"

    demo_authors ||--o{ demo_articles : "writes"
    demo_articles ||--o{ demo_comments : "has"

    demo_customers {
        uuid id PK
        timestamp created_at
        string sample_name
        string sample_email
    }
    demo_orders {
        uuid id PK
        timestamp created_at
        uuid customer_id FK
        string sample_status
        numeric sample_total
    }
    demo_order_items {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int sample_quantity
        numeric sample_price
    }
    demo_products {
        uuid id PK
        string sample_title
        numeric sample_price
        boolean sample_active
    }
    demo_addresses {
        uuid id PK
        uuid customer_id FK
        string sample_line1
        string sample_city
    }
    demo_reviews {
        uuid id PK
        uuid product_id FK
        uuid customer_id FK
        int sample_rating
        text sample_body
    }
    demo_authors {
        uuid id PK
        string sample_name
        string sample_bio
    }
    demo_articles {
        uuid id PK
        uuid author_id FK
        string sample_headline
        text sample_body
    }
    demo_comments {
        uuid id PK
        uuid article_id FK
        string sample_author
        text sample_body
    }
    demo_feature_flags {
        uuid id PK
        string sample_key
        boolean sample_enabled
    }
    demo_audit_log {
        uuid id PK
        timestamp sample_at
        string sample_action
    }`,
  fkTargets: {
    customer_id: 'demo_customers',
    order_id: 'demo_orders',
    product_id: 'demo_products',
    author_id: 'demo_authors',
    article_id: 'demo_articles',
  },
};
