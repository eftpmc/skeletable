"""Departments and categories for catalog products, read from the words stores use.

The ids match packages/shared/src/taxonomy.ts, which has the names the app shows.

A product's category is the garment its title names. Titles put the garment last ("Shirt Dress",
"Denim Jacket", "Swim Shorts"), so of every category word in the title the one ending last wins, and
the longest wins among those ending at the same place. The product type a store sets is read first:
it's cleaner when it names a garment ("Dresses", "T-Shirts") and skipped when it doesn't ("FW26").
Tags count only when they name one category and nothing else does.
"""
import re

CATEGORY_WORDS = {
    "dresses": r"dress(es)?|gowns?|jumpsuits?|playsuits?|rompers?|kaftans?|caftans?|sundress(es)?|boiler ?suits?|overalls?|dungarees",
    "skirts": r"skirts?|skorts?|sarongs?|mini skirts?|midi skirts?",
    "tops": r"t-?shirts?|tee-?shirts?|kurtas?|tees?|tanks?|tank tops?|tops?|camis?|camisoles?|blouses?|bodysuits?|polos?|polo shirts?|henleys?|"
            r"long ?sleeves?|l/s tee|s/s tee|bustiers?|corsets?|halters?|tube tops?|crop tops?|singlets?|muscle tees?|tunics?|shells? top",
    "shirts": r"shirts?|button[- ](down|up)s?|overshirts?|flannels?|oxford shirts?|shirting|camp collar|work shirts?",
    "knitwear": r"sweaters?|jumpers?|cardigans?|cardis?|knits?|knitwear|pullovers?|turtlenecks?|roll ?necks?|mock ?necks?|"
                r"sweater vests?|knit vests?|tank knit|polo knit|knitted polo",
    "sweats": r"hoodies?|hoody|hooded sweatshirts?|sweatshirts?|crew ?necks?|crews|sweatpants|sweat pants|joggers?|track ?pants|"
              r"quarter[- ]zips?|half[- ]zips?|zip[- ]ups?|zip hoodies?|sweats|sweat shorts|tracksuits?",
    "outerwear": r"jackets?|coats?|parkas?|anoraks?|puffers?|bombers?|trenches|trench coats?|gilets?|vests?|windbreakers?|shackets?|"
                 r"overcoats?|topcoats?|raincoats?|kimonos?|fleeces?|shells?|ponchos?|capes?|chore coats?|field jackets?|down jackets?|liners?|"
                 r"varsity jackets?|denim jackets?|leather jackets?|trucker jackets?|cagoules?|smocks?",
    "tailoring": r"blazers?|suits?|waistcoats?|tuxedos?|sport ?coats?|suit jackets?|suit trousers|tailored jackets?|dinner jackets?",
    "trousers": r"pants?|trousers?|capris?|chinos?|slacks|culottes|cargos?|cargo pants|flares|wide[- ]legs?|straight[- ]legs?|carpenter pants|"
                r"work pants|fatigues|pantalons?",
    "jeans": r"jeans?|denims?|selvedge|5[- ]pockets?",
    "shorts": r"shorts?|bermudas?|short pants|cargo shorts|denim shorts|jorts",
    "activewear": r"leggings?|sports? bras?|bike shorts|biker shorts|cycling shorts|running shorts|running tights|yoga pants|"
                  r"active ?wear|track tops?|gym shorts|training tops?|unitards?|catsuits?|base ?layers?",
    "swimwear": r"bikinis?|bikini (tops?|bottoms?|briefs?)|swimsuits?|swim ?wear|swim ?shorts|swim ?trunks|trunks|board ?shorts|"
                r"bathing suits?|one[- ]pieces?|rash ?guards?|swim (tops?|briefs?|bottoms?)|tankinis?|cover[- ]ups?",
    "intimates": r"bras?|bralettes?|briefs?|boxers?|boxer briefs?|underwear|undies|panty|panties|thongs?|lingerie|slips?|"
                 r"pyjamas?|pajamas?|pj sets?|robes?|nightgowns?|nightdress(es)?|night ?shirts?|socks?|tights|stockings|"
                 r"loungewear|lounge (pants|sets?)|boyshorts|sleepwear|sleep shirts?|garters?|hosiery|undershirts?|long johns",
    "shoes": r"shoes?|sneakers?|trainers?|boots?|loafers?|sandals?|heels|pumps|mules?|clogs?|slides|flats|ballet flats|espadrilles?|"
             r"slippers?|oxfords|derbys?|derbies|brogues?|mary janes?|kitten heels?|wedges|footwear|moccasins?|flip[- ]flops?|chelsea boots?",
    "bags": r"bags?|totes?|tote bags?|backpacks?|clutch(es)?|purses?|crossbody|cross[- ]body bags?|pouch(es)?|duffle?s?|duffel bags?|"
            r"handbags?|satchels?|rucksacks?|shoulder bags?|bum bags?|fanny packs?|belt bags?|messenger bags?|weekenders?|baguettes?",
    "accessories": r"accessor(y|ies)|hair accessories|hats?|caps?|beanies?|bucket hats?|berets?|scarf|scarves|shawls?|stoles?|belts?|ties|neck ?ties?|bow ?ties?|"
                   r"gloves?|mittens?|sunglasses|eyewear|bandanas?|scrunchies?|hair ?clips?|headbands?|hair ?bands?|wallets?|"
                   r"card ?holders?|key ?(rings?|chains?|fobs?)|umbrellas?|balaclavas?|suspenders|braces|pocket squares?|"
                   r"neckerchiefs?|snoods?|ear ?muffs?|visors?|hair ?pins?|barrettes?|watches?|watch straps?|lanyards?|"
                   r"hair (bows?|ties?)|bows?",
    "jewelry": r"necklaces?|rings?|earrings?|bracelets?|bangles?|pendants?|chains?|anklets?|brooch(es)?|cuff ?links?|studs?|hoops?|"
               r"chokers?|charms?|jewell?ery|signets?|ear ?cuffs?|huggies|lockets?|cuffs? bracelets?",
}

# Not clothing: never offered as products.
OTHER = re.compile(
    r"\b(gift ?cards?|e-?gift|gift certificates?|vouchers?|candles?|mugs?|posters?|prints?|art ?prints?|stickers?|books?|zines?|"
    r"magazines?|perfumes?|fragrances?|eau de|colognes?|soaps?|towels?|blankets?|pillows?|cushions?|ornaments?|vases?|"
    r"notebooks?|shipping|insurance|protection|deposits?|samples?|swatch(es)?|mystery|alterations?|hemming|repairs?|"
    r"custom orders?|donations?|tickets?|tumblers?|bottles?|coasters?|incense|diffusers?|lip ?(balm|stick|gloss)|serums?|"
    r"creams?|lotions?|candle|keepsakes?|plush|toys?|puzzles?|patch(es)?|pins? badges?|enamel pins?|bundle offer|"
    r"dog|dogs|pet|pets|collars?|leash(es)?|rugs?|throws?|tapestr(y|ies)|wall art|frames?|cards?|wrapping|gift ?wrap|"
    r"care kits?|lint|stuffed animals?|trivets?|napkins?|aprons?|workshops?|tableware|shoe care|cleaner|laundry|hangers?|garment bags?|test product|do not (buy|purchase))\b",
    re.I,
)

KIDS = re.compile(r"\b(kids?|kid's|children'?s?|child|baby|babies|toddlers?|infants?|newborns?|youth|juniors?|boys?|girls?|boy's|girl's|"
                  r"little ones?|mini me|bambino|enfants?)\b", re.I)

DEPARTMENT_WORDS = [
    ("unisex", re.compile(r"\b(unisex|gender[- ]?(neutral|less|free)|all[- ]gender|non[- ]?binary)\b", re.I)),
    ("women", re.compile(r"\b(women'?s?|womens|woman'?s?|womenswear|ladies|lady'?s?|female|femme|for her|wmns|w's)\b", re.I)),
    ("men", re.compile(r"\b(men'?s?|mens|man'?s|menswear|male|homme|for him|gents?|gentlemen)\b", re.I)),
]

# Categories nearly all made for women; a product in one with no other word on it counts as women's.
WOMEN_CATEGORIES = {"dresses", "skirts"}
WOMEN_WORDS = re.compile(r"\b(bras?|bralettes?|bikinis?|panty|panties|thongs?|lingerie|bodysuits?|camisoles?|corsets?|bustiers?|"
                         r"blouses?|heels|kitten heels?|mary janes?|tankinis?|sports? bras?|leggings?|nightgowns?|nightdress(es)?)\b", re.I)

def _longest_first(words):
    """Split an alternation at its top level and put longer alternatives first, so "sweater vest"
    is read as one garment rather than "sweater" followed by a stray "vest"."""
    parts, depth, cur = [], 0, ""
    for ch in words:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "|" and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    return "|".join(sorted(parts + [cur], key=len, reverse=True))


_patterns = [(cat, re.compile(rf"\b({_longest_first(words)})\b", re.I)) for cat, words in CATEGORY_WORDS.items()]


def _head(text):
    """The category the text's garment noun belongs to: the match ending last, then the longest."""
    best = None
    for cat, pat in _patterns:
        for m in pat.finditer(text):
            key = (m.end(), m.end() - m.start())
            if best is None or key > best[0]:
                best = (key, cat)
    return best[1] if best else None


def clean_title(title):
    # "Sofia Dress - Oat Leopard", "Matthew T-Shirt | Navy", "Naval L/S Tee / TR26AW-201": the garment comes before the colour.
    t = re.split(r"\s+[-–|/]\s+|,\s", title or "")[0]
    return re.sub(r"\([^)]*\)", " ", t)


def tag_list(tags):
    if isinstance(tags, str):
        tags = tags.split(",")
    return [t.strip() for t in tags or [] if t and len(t.strip()) < 40]


def category(title, product_type="", tags=()):
    """(category, how): how is "type", "title" or "tags"; category None when nothing names one, "other" when it isn't clothing."""
    text = f"{title or ''} {product_type or ''}"
    if OTHER.search(text) and not _head(clean_title(title)):
        return "other", "title"
    if product_type and (c := _head(product_type)):
        return c, "type"
    if c := _head(clean_title(title)):
        return c, "title"
    if c := _head(title or ""):
        return c, "title"
    found = {_head(t) for t in tag_list(tags)} - {None}
    if len(found) == 1:
        return found.pop(), "tags"
    return None, None


def is_kids(title, product_type="", tags=()):
    text = " ".join([title or "", product_type or "", *tag_list(tags)])
    # "Boyfriend jeans" and "girlfriend tee" are cuts, not kids' clothes; the \b in KIDS already skips them.
    return bool(KIDS.search(text))


def department_words(title, product_type="", tags=()):
    """The department the words on a product name, if any: "women", "men" or "unisex"."""
    for text in (title or "", product_type or "", " ".join(tag_list(tags))):
        hits = {dep for dep, pat in DEPARTMENT_WORDS if pat.search(text)}
        if "unisex" in hits or {"women", "men"} <= hits:
            return "unisex"
        if hits:
            return hits.pop()
    return None


def women_by_garment(cat, title):
    return cat in WOMEN_CATEGORIES or bool(WOMEN_WORDS.search(title or ""))
