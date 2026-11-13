-- «Связанные статьи»: связь «многие ко многим» между узлами дерева и статьями.
-- Применяется в Supabase: Dashboard → SQL Editor → Run.
-- Предполагается, что nodes.id и articles.id — PRIMARY KEY (текстовые).

create table if not exists article_links (
  node_id text not null references nodes(id) on delete cascade,
  article_id text not null references articles(id) on delete cascade,
  primary key (node_id, article_id)
);

-- обратная выборка: все статьи по узлу (уже покрывается PK), и все узлы по статье
create index if not exists article_links_article_idx
  on article_links (article_id);
