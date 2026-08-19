import type { Graph } from '@/lib/jsonld';

/**
 * The only place this app writes a JSON-LD script tag.
 *
 * Escaping `<` is not cosmetic. Post bodies arrive from the network verbatim,
 * so a post containing `</script>` would otherwise close this element and
 * anything after it would be parsed as live markup. `<` is valid JSON and
 * JSON.parse restores the character, so a crawler still reads the exact text
 * the page displays.
 *
 * Keep this outside any Suspense boundary: streamed in, it arrives as script
 * instructions rather than literal HTML, and the crawlers that don't run
 * JavaScript — the ones an archive exists for — would never see it.
 */
export function JsonLd({ graph }: { graph: Graph }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }}
    />
  );
}
