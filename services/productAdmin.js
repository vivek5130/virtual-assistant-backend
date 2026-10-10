// Normalise admin/seed product input into the Shopify-style document shape.
const Collection = require("../models/Collection");
const { HttpError } = require("../utils/http");

const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
const cartesian = (lists) => lists.reduce((acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])), [[]]);

/**
 * Accepts either explicit `variants` or `options` + `variantDefaults`
 * (price, compareAtPrice, inventoryQuantity, weight, weightUnit,
 * priceAdjustments: { Size: { XL: 100 } }, skuPrefix) and generates every
 * option combination — the same shortcut Shopify's admin offers.
 */
function buildVariants(input) {
  const options = (input.options || []).filter((o) => o.name && o.values?.length).slice(0, 3);
  if (Array.isArray(input.variants) && input.variants.length) {
    return {
      options,
      variants: input.variants.map((v, i) => ({
        ...v,
        title: v.title || Object.values(v.options || {}).join(" / ") || "Default Title",
        position: i + 1,
      })),
    };
  }
  const d = input.variantDefaults || {};
  if (d.price === undefined) throw new HttpError(400, "Provide variants or variantDefaults.price");
  const combos = options.length ? cartesian(options.map((o) => o.values)) : [[]];
  const prefix = d.skuPrefix || slugify(input.title).slice(0, 10).toUpperCase();
  const variants = combos.map((values, i) => {
    const opts = Object.fromEntries(values.map((v, j) => [options[j].name, v]));
    const bump = Object.entries(opts).reduce((sum, [name, value]) => sum + (d.priceAdjustments?.[name]?.[value] || 0), 0);
    const stock = typeof d.inventoryByOption === "object"
      ? Object.entries(opts).reduce((n, [name, value]) => d.inventoryByOption?.[name]?.[value] ?? n, d.inventoryQuantity ?? 10)
      : d.inventoryQuantity ?? 10;
    return {
      title: values.length ? values.join(" / ") : "Default Title",
      sku: [prefix, ...values.map((v) => slugify(v).toUpperCase())].join("-"),
      price: d.price + bump,
      compareAtPrice: d.compareAtPrice ? d.compareAtPrice + bump : undefined,
      inventoryQuantity: stock,
      inventoryPolicy: d.inventoryPolicy || "deny",
      options: opts,
      weight: d.weight || 0,
      weightUnit: d.weightUnit || "g",
      requiresShipping: d.requiresShipping !== false,
      imageUrl: d.imageByOption ? Object.entries(opts).map(([n, v]) => d.imageByOption?.[n]?.[v]).find(Boolean) : undefined,
      position: i + 1,
    };
  });
  return { options, variants };
}

async function toDocument(merchantId, input) {
  if (!input.title) throw new HttpError(400, "Title required");
  const { options, variants } = buildVariants(input);
  const handles = input.collections || [];
  const collections = handles.length
    ? await Collection.find({ merchantId, $or: [{ handle: { $in: handles.filter((h) => !/^[0-9a-f]{24}$/.test(h)) } }, { _id: { $in: handles.filter((h) => /^[0-9a-f]{24}$/.test(h)) } }] })
    : [];
  const metafields = Array.isArray(input.metafields)
    ? input.metafields
    : Object.entries(input.specs || {}).map(([key, value]) => ({ namespace: "specs", key, value: String(value) }));
  return {
    merchantId,
    title: input.title,
    handle: input.handle ? slugify(input.handle) : slugify(input.title),
    description: input.description || "",
    vendor: input.vendor || "",
    productType: input.productType || "",
    category: input.category || "",
    tags: (input.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean),
    status: input.status || "active",
    collections: collections.map((c) => c._id),
    options,
    variants,
    images: (input.images || []).map((img) => (typeof img === "string" ? { url: img, alt: input.title } : img)),
    seo: input.seo || {},
    metafields,
    ...(input.rating !== undefined ? { rating: input.rating, ratingCount: input.ratingCount || 0 } : {}),
  };
}

module.exports = { toDocument, buildVariants, slugify };
