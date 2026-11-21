-- Book map: a book is split into sections at ingestion, every chunk belongs
-- to one section, and a lesson built from a book retrieves its excerpts from
-- one section. Shapes mirror web/src/contracts/domain.ts and ai.ts.

-- BookSection[] from web/src/contracts/domain.ts, in reading order.
alter table book
  add column sections jsonb not null default '[]';

-- BookSection.index of the section the chunk belongs to.
alter table book_chunk
  add column section_index int not null default 0;

-- BookSection.index the lesson is taught from; null when the curriculum has
-- no book or the lesson (for example a remedial one) has no section.
alter table lesson
  add column book_section_index int;

-- Every search is inside one book, a few hundred chunks at most. An exact
-- scan over that book's rows is fast and always returns the true nearest
-- chunks; the HNSW index filtered after the fact could return too few.
drop index book_chunk_embedding_idx;

create index book_chunk_book_section_idx
  on book_chunk (book_id, section_index);

-- Nearest chunks of one book to a query embedding, by cosine distance.
-- With p_section_index the search stays inside that section. chunk_index is
-- returned so the caller can put the chunks back in reading order.
drop function match_book_chunks(uuid, vector, int);

create function match_book_chunks(
  p_book_id       uuid,
  p_embedding     vector(1536),
  p_limit         int default 8,
  p_section_index int default null
)
returns table (chunk_index int, content text, similarity real)
language sql stable
as $$
  select c.chunk_index,
         c.content,
         (1 - (c.embedding <=> p_embedding))::real as similarity
  from book_chunk c
  where c.book_id = p_book_id
    and (p_section_index is null or c.section_index = p_section_index)
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;
