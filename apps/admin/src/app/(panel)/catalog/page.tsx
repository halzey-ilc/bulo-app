'use client';

import { Camera, Eye, EyeOff, ImageOff, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { usePriceTypes } from '@/components/partner-forms';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  Note,
  PageHeader,
  Select,
  Table,
  Tabs,
  Td,
  Textarea,
  Th,
  Toggle,
  cx,
} from '@/components/ui';
import { api, photoSrc } from '@/lib/api';
import { fmtMoney, fmtQty } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import type { Category, PriceType, Product } from '@/lib/types';

type Tab = 'products' | 'categories' | 'prices';

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>('products');
  const products = useLoad(() => api.get<Product[]>('/admin/catalog/products'), []);
  const categories = useLoad(() => api.get<Category[]>('/admin/catalog/categories'), []);
  const priceTypes = usePriceTypes();

  return (
    <>
      <PageHeader title="Каталог" subtitle="Товары, категории и цены, которые видят партнёры в приложении" />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'products', label: 'Товары' },
            { value: 'categories', label: 'Категории' },
            { value: 'prices', label: 'Типы цен' },
          ]}
        />
      </div>
      {tab === 'products' && (
        <ProductsTab
          products={products.data}
          loading={products.loading}
          error={products.error}
          reload={products.reload}
          categories={categories.data ?? []}
          priceTypes={priceTypes.data ?? []}
        />
      )}
      {tab === 'categories' && (
        <CategoriesTab categories={categories.data} loading={categories.loading} reload={() => (categories.reload(), products.reload())} />
      )}
      {tab === 'prices' && <PriceTypesTab priceTypes={priceTypes.data} loading={priceTypes.loading} reload={priceTypes.reload} />}
    </>
  );
}

/* ================= Товары ================= */

function ProductsTab({
  products,
  loading,
  error,
  reload,
  categories,
  priceTypes,
}: {
  products: Product[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  categories: Category[];
  priceTypes: PriceType[];
}) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products ?? []).filter((p) => (!cat || p.categoryId === cat) && (!s || p.name.toLowerCase().includes(s)));
  }, [products, search, cat]);

  const grouped = useMemo(() => {
    const map = new Map<string, { cat: Category; items: Product[] }>();
    for (const p of filtered) {
      const g = map.get(p.categoryId) ?? { cat: p.category, items: [] };
      g.items.push(p);
      map.set(p.categoryId, g);
    }
    return [...map.values()].sort((a, b) => a.cat.sortOrder - b.cat.sortOrder);
  }, [filtered]);

  const toggle = async (p: Product, field: 'visible' | 'isNew') => {
    setBusyId(p.id + field);
    try {
      await api.patch(`/admin/catalog/products/${p.id}`, { [field]: !p[field] });
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Поиск товара" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full sm:w-56">
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="flex-1" />
        <Button onClick={() => setEditing('new')} disabled={!categories.length}>
          <Plus className="h-4 w-4" /> Новый товар
        </Button>
      </div>

      {loading && !products ? (
        <Loading />
      ) : error ? (
        <Note tone="red">{error}</Note>
      ) : !grouped.length ? (
        <Card>
          <Empty title="Товаров не найдено" />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <Card key={g.cat.id} className="p-0 sm:p-0">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div className="font-bold">
                  {g.cat.name}
                  {!g.cat.visible && <span className="ml-2 text-xs font-semibold text-coffee">категория скрыта</span>}
                </div>
                <span className="text-xs text-muted">участок: {g.cat.workshopArea || '—'}</span>
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th className="pl-5">Товар</Th>
                    <Th>Кратность</Th>
                    {priceTypes.map((pt) => (
                      <Th key={pt.id} className="text-right">
                        {pt.name}
                      </Th>
                    ))}
                    <Th>Новинка</Th>
                    <Th>Видимость</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((p) => (
                    <tr key={p.id} className={cx(!p.visible && 'opacity-60')}>
                      <Td className="pl-5">
                        <div className="flex items-center gap-3">
                          <Thumb url={p.photoUrl} />
                          <div>
                            <div className="font-semibold">{p.name}</div>
                            <div className="text-xs text-muted">{[p.weight, p.shelfLife].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {fmtQty(p.multiplicity)} {p.unit}
                      </Td>
                      {priceTypes.map((pt) => {
                        const price = p.prices.find((x) => x.priceTypeId === pt.id)?.price;
                        return (
                          <Td key={pt.id} className="text-right whitespace-nowrap tabular-nums">
                            {price !== undefined ? fmtMoney(price) : <span className="text-coffee/70">нет цены</span>}
                          </Td>
                        );
                      })}
                      <Td>
                        <button
                          onClick={() => toggle(p, 'isNew')}
                          disabled={busyId === p.id + 'isNew'}
                          className={cx(
                            'rounded-full px-2.5 py-1 text-xs font-semibold',
                            p.isNew ? 'bg-mango-soft text-mango-dark' : 'bg-oat text-muted hover:text-cambodia',
                          )}
                        >
                          <Sparkles className="mr-1 inline h-3 w-3" />
                          {p.isNew ? 'новинка' : 'нет'}
                        </button>
                      </Td>
                      <Td>
                        <Toggle
                          checked={p.visible}
                          disabled={busyId === p.id + 'visible'}
                          onChange={() => toggle(p, 'visible')}
                          label={<span className="text-xs text-muted">{p.visible ? 'виден' : 'скрыт'}</span>}
                        />
                      </Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                          <Pencil className="h-3.5 w-3.5" /> Изменить
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing === 'new' ? null : editing}
          categories={categories}
          priceTypes={priceTypes}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}

function Thumb({ url, size = 'h-11 w-11' }: { url: string | null; size?: string }) {
  const src = photoSrc(url);
  return (
    <div className={cx('flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-oat', size)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-4 w-4 text-muted/60" />
      )}
    </div>
  );
}

function ProductModal({
  product,
  categories,
  priceTypes,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  priceTypes: PriceType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState<Product | null>(product);
  const [f, setF] = useState({
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    composition: product?.composition ?? '',
    weight: product?.weight ?? '',
    shelfLife: product?.shelfLife ?? '',
    unit: product?.unit ?? 'шт',
    multiplicity: String(product?.multiplicity ?? 1),
    sortOrder: String(product?.sortOrder ?? 0),
  });
  const [visible, setVisible] = useState(product?.visible ?? true);
  const [isNew, setIsNew] = useState(product?.isNew ?? false);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(priceTypes.map((pt) => [pt.id, String(product?.prices.find((x) => x.priceTypeId === pt.id)?.price ?? '')])),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const mult = Number(f.multiplicity.replace(',', '.'));
  const valid = f.name.trim().length > 0 && f.categoryId && mult > 0;

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        categoryId: f.categoryId,
        name: f.name.trim(),
        description: f.description,
        composition: f.composition,
        weight: f.weight,
        shelfLife: f.shelfLife,
        unit: f.unit.trim() || 'шт',
        multiplicity: mult,
        sortOrder: Math.round(Number(f.sortOrder) || 0),
        visible,
        isNew,
      };
      const saved = current
        ? await api.patch<Product>(`/admin/catalog/products/${current.id}`, body)
        : await api.post<Product>('/admin/catalog/products', body);
      const items = Object.entries(prices)
        .filter(([, v]) => v.trim() !== '')
        .map(([priceTypeId, v]) => ({ priceTypeId, price: Number(v.replace(',', '.')) }));
      if (items.some((i) => isNaN(i.price) || i.price < 0)) throw new Error('Проверьте цены');
      await api.put(`/admin/catalog/products/${saved.id}/prices`, { items });
      toast.success(current ? 'Товар сохранён' : 'Товар создан — теперь можно добавить фото');
      onSaved();
      if (current) onClose();
      else setCurrent({ ...saved, prices: [], category: categories.find((c) => c.id === saved.categoryId)! });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!current) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.upload<Product>(`/admin/catalog/products/${current.id}/photo`, form);
      setCurrent({ ...current, photoUrl: res.photoUrl });
      toast.success('Фото загружено');
      onSaved();
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={current ? current.name || 'Товар' : 'Новый товар'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {current && !product ? 'Готово' : 'Отмена'}
          </Button>
          <Button onClick={save} loading={busy} disabled={!valid}>
            {current ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <div>
          <Thumb url={current?.photoUrl ?? null} size="h-44 w-full md:w-44" />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            disabled={!current}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="h-3.5 w-3.5" /> {current?.photoUrl ? 'Заменить фото' : 'Загрузить фото'}
          </Button>
          <p className="mt-2 text-[11px] text-muted">{current ? 'JPG, PNG или WEBP до 8 МБ' : 'Фото можно добавить после создания'}</p>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название *" className="sm:col-span-2">
              <Input value={f.name} onChange={set('name')} />
            </Field>
            <Field label="Категория *">
              <Select value={f.categoryId} onChange={set('categoryId')}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ед. изм.">
                <Input value={f.unit} onChange={set('unit')} placeholder="шт" />
              </Field>
              <Field label="Кратность *" hint="заказ кратно">
                <Input value={f.multiplicity} onChange={set('multiplicity')} inputMode="decimal" />
              </Field>
            </div>
            <Field label="Вес">
              <Input value={f.weight} onChange={set('weight')} placeholder="120 г" />
            </Field>
            <Field label="Срок годности">
              <Input value={f.shelfLife} onChange={set('shelfLife')} placeholder="48 часов" />
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea value={f.description} onChange={set('description')} />
            </Field>
            <Field label="Состав" className="sm:col-span-2">
              <Textarea value={f.composition} onChange={set('composition')} className="min-h-[60px]" />
            </Field>
          </div>

          <div className="rounded-2xl border border-line p-4">
            <div className="mb-3 text-sm font-bold">Цены, сом</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {priceTypes.map((pt) => (
                <Field key={pt.id} label={`${pt.name}${pt.isDefault ? ' (по умолчанию)' : ''}`}>
                  <Input
                    value={prices[pt.id] ?? ''}
                    onChange={(e) => setPrices({ ...prices, [pt.id]: e.target.value })}
                    inputMode="decimal"
                    placeholder="—"
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Toggle checked={visible} onChange={setVisible} label="Показывать в каталоге" />
            <Toggle checked={isNew} onChange={setIsNew} label="Новинка" />
            <Field label="Порядок" className="w-24">
              <Input value={f.sortOrder} onChange={set('sortOrder')} inputMode="numeric" />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Категории ================= */

function CategoriesTab({ categories, loading, reload }: { categories: Category[] | null; loading: boolean; reload: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const patch = async (c: Category, body: Partial<Category>) => {
    try {
      await api.patch(`/admin/catalog/categories/${c.id}`, body);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (c: Category) => {
    if (!confirm(`Удалить категорию «${c.name}»?`)) return;
    try {
      await api.del(`/admin/catalog/categories/${c.id}`);
      toast.success('Категория удалена');
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Новая категория
        </Button>
      </div>
      <Card className="p-0 sm:p-0">
        {loading && !categories ? (
          <Loading />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="pl-5">Категория</Th>
                <Th>Участок цеха</Th>
                <Th>Товаров</Th>
                <Th>Порядок</Th>
                <Th>Видимость</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(categories ?? []).map((c) => (
                <tr key={c.id}>
                  <Td className="pl-5 font-semibold">{c.name}</Td>
                  <Td>{c.workshopArea ? <Chip className="bg-mango-soft text-mango-dark">{c.workshopArea}</Chip> : '—'}</Td>
                  <Td>{c._count?.products ?? 0}</Td>
                  <Td>{c.sortOrder}</Td>
                  <Td>
                    <button
                      onClick={() => patch(c, { visible: !c.visible })}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-cambodia"
                    >
                      {c.visible ? <Eye className="h-4 w-4 text-cambodia" /> : <EyeOff className="h-4 w-4" />}
                      {c.visible ? 'видна' : 'скрыта'}
                    </button>
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} disabled={(c._count?.products ?? 0) > 0} title="Удалить можно только пустую категорию">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">
        «Участок цеха» группирует позиции в сводной накладной на производство (например: Выпечка, Кондитерский цех).
      </p>
      {editing && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [area, setArea] = useState(category?.workshopArea ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [visible, setVisible] = useState(category?.visible ?? true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Категория' : 'Новая категория'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const body = { name: name.trim(), workshopArea: area.trim(), sortOrder: Math.round(Number(sortOrder) || 0), visible };
                if (category) await api.patch(`/admin/catalog/categories/${category.id}`, body);
                else await api.post('/admin/catalog/categories', body);
                toast.success('Сохранено');
                onSaved();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Название *">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Участок цеха" hint="Для группировки в сводной накладной">
          <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Выпечка" />
        </Field>
        <Field label="Порядок сортировки">
          <Input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
        </Field>
        <Toggle checked={visible} onChange={setVisible} label="Показывать в каталоге" />
      </div>
    </Modal>
  );
}

/* ================= Типы цен ================= */

function PriceTypesTab({ priceTypes, loading, reload }: { priceTypes: PriceType[] | null; loading: boolean; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const patch = async (id: string, body: Partial<PriceType>) => {
    try {
      await api.patch(`/admin/catalog/price-types/${id}`, body);
      toast.success('Сохранено');
      setRenaming(null);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="p-0 sm:p-0">
        {loading && !priceTypes ? (
          <Loading />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="pl-5">Тип цен</Th>
                <Th>Партнёров</Th>
                <Th>Код 1С</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(priceTypes ?? []).map((pt) => (
                <tr key={pt.id}>
                  <Td className="pl-5">
                    {renaming?.id === pt.id ? (
                      <div className="flex gap-2">
                        <Input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className="h-9" />
                        <Button size="sm" onClick={() => patch(pt.id, { name: renaming.name.trim() })} disabled={!renaming.name.trim()}>
                          OK
                        </Button>
                      </div>
                    ) : (
                      <span className="font-semibold">
                        {pt.name}
                        {pt.isDefault && <Chip className="ml-2 bg-mango-soft text-mango-dark">по умолчанию</Chip>}
                      </span>
                    )}
                  </Td>
                  <Td>{pt._count?.partners ?? 0}</Td>
                  <Td className="text-muted">{pt.oneCId ?? '—'}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {!pt.isDefault && (
                      <Button size="sm" variant="ghost" onClick={() => patch(pt.id, { isDefault: true })}>
                        Сделать основным
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: pt.id, name: pt.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <div className="mb-3 font-bold">Новый тип цен</div>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Сетевая" />
          <Button
            className="w-full"
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post('/admin/catalog/price-types', { name: name.trim() });
                setName('');
                toast.success('Тип цен добавлен');
                reload();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Партнёр видит цены своего типа; без типа — цены по умолчанию. Обычно типы цен и сами цены приходят из 1С.
        </p>
      </Card>
    </div>
  );
}
