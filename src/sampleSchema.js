/**
 * Placeholder schema shown before a live Postgres database is picked.
 * This is NOT real data: every table/column is prefixed with `demo_` /
 * `sample_` so it can never be mistaken for a real schema.
 */
const t = (name, ...columns) => ({ name, columns });
const pk = (name, type = 'uuid') => ({ name, type, pk: true, fk: false });
const col = (name, type) => ({ name, type, pk: false, fk: false });
const fk = (name, table, type = 'uuid') => ({ name, type, pk: false, fk: true, ref: { table, column: 'id' } });

export const sampleSchema = {
  tables: [
    t('demo_customers', pk('id'), col('created_at', 'timestamp'), col('sample_name', 'string'), col('sample_email', 'string')),
    t('demo_orders', pk('id'), col('created_at', 'timestamp'), fk('customer_id', 'demo_customers'), col('sample_status', 'string'), col('sample_total', 'numeric')),
    t('demo_order_items', pk('id'), fk('order_id', 'demo_orders'), fk('product_id', 'demo_products'), col('sample_quantity', 'int'), col('sample_price', 'numeric')),
    t('demo_products', pk('id'), col('sample_title', 'string'), col('sample_price', 'numeric'), col('sample_active', 'boolean')),
    t('demo_addresses', pk('id'), fk('customer_id', 'demo_customers'), col('sample_line1', 'string'), col('sample_city', 'string')),
    t('demo_reviews', pk('id'), fk('product_id', 'demo_products'), fk('customer_id', 'demo_customers'), col('sample_rating', 'int'), col('sample_body', 'text')),
    t('demo_authors', pk('id'), col('sample_name', 'string'), col('sample_bio', 'string')),
    t('demo_articles', pk('id'), fk('author_id', 'demo_authors'), col('sample_headline', 'string'), col('sample_body', 'text')),
    t('demo_comments', pk('id'), fk('article_id', 'demo_articles'), col('sample_author', 'string'), col('sample_body', 'text')),
    t('demo_feature_flags', pk('id'), col('sample_key', 'string'), col('sample_enabled', 'boolean')),
    t('demo_audit_log', pk('id'), col('sample_at', 'timestamp'), col('sample_action', 'string')),
  ],
};
