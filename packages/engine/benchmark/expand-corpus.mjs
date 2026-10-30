import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const manifest = await readFile(new URL('corpus.json', root));
await writeFile(new URL('corpus-initial.json', root), manifest, {flag:'wx'});
await writeFile(new URL('baseline-initial.json', root), await readFile(new URL('baseline.json', root)), {flag:'wx'});
const corpus = JSON.parse(manifest);
const captures = JSON.parse(await readFile(new URL('pages-expanded/captures.json', root)));
const label = (value, evidence) => ({value,evidence});
const fields = (title,price,currency) => ({ title:label(title,'Inspected saved Product JSON-LD name; independently transcribed.'),price:label(price,'Inspected saved Product offer amount converted to minor units.'),currency:label(currency,'Inspected saved Product offer priceCurrency.') });
for (const color of ['white','black']) {
  const id=`buckmason-${color}`, capture=captures.find(c=>c.id===id), prefix=color==='white'?'WHT':'BLK';
  const variants=['XS','S','M','L','XL','XXL'].map(title=>({title,price:6200,currency:'USD',available:true,sku:`BM11049.549${prefix}${title}`,gtin:null})).sort((a,b)=>a.title.localeCompare(b.title,'en'));
  corpus.cases.push({id,site:'buckmason',platform:'shopify',platformEvidence:'Shopify CDN and checkout store; Product offers contain six size SKUs.',split:'development',file:`pages-expanded/${capture.file}`,url:capture.finalUrl,capturedAt:capture.capturedAt,sha256:capture.sha256,kind:'product',notes:'Six itemOffered size variants in Product offers; aggregate offer is not a seventh variant. No barcode published in these offers. Used for development of variant-offer support.',labels:{...fields(`${color==='white'?'White':'Black'} Field-Spec Cotton Heavy Tee`,6200,'USD'),available:label(true,'Product AggregateOffer availability InStock.'),variantFacts:label(variants,'Manually reviewed all six Offer rows: size, price 62 USD, availability InStock, BM11049.549 size SKU. No GTIN on these rows.')}});
}
const extra=[
 ['sparkfun-second','sparkfun',fields('Arduino Uno - R3',2760,'USD'),'Numeric JSON-LD price 27.6; unrelated recommendation prices must not be used.'],
 ['nintendo-second','nintendo',{...fields('Super Mario Bros.™ Wonder',5999,'USD'),available:label(true,'Product offers.availability InStock.'),sku:label('7100068688','Product JSON-LD sku.')},'Second untouched holdout product on Nintendo.'],
 ['apple-second','apple',{...fields('MacBook Air',129900,'USD'),available:label(null,'AggregateOffer states range 1299–3719 USD, without availability.')},'Second untouched holdout page; price label is explicitly the aggregate lower bound.'],
 ['adafruit-third','adafruit',{...fields('Adafruit CP2105 Friend - USB to Dual UART Serial Converters',695,'USD'),available:label(true,'Unique unscoped itemprop=availability says in stock; metadata price agrees with $6.95.')},'JSON-LD malformed; title and price labels verified from Open Graph and visible product price, currency from product metadata.']
];
for(const [id,site,labels,notes] of extra) {
 const capture=captures.find(c=>c.id===id), template=corpus.cases.find(c=>c.site===site);
 corpus.cases.push({...template,id,file:`pages-expanded/${capture.file}`,url:capture.finalUrl,capturedAt:capture.capturedAt,sha256:capture.sha256,notes,labels});
}
await writeFile(new URL('corpus.json',root),JSON.stringify(corpus,null,2)+'\n');
