"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/app/_components/ToastProvider";
import OwnerShell from "../_components/OwnerShell";

type Order = {
  id: string;
  recipient_id: string;
  customer_name: string;
  contact_number: string;
  order_summary: string;
  status: string;
  total_amount: number | null;
  payment_method: string;
  delivery_method: string;
  delivery_address: string;
  notes: string;
  created_at: string;
};

type OrdersResponse = {
  client?: {
    client_name: string;
  };
  orders?: Order[];
  error?: string;
};

function formatTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function OwnerOrdersPage() {
  const { showToast } = useToast();
  const [clientName, setClientName] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      const response = await fetch("/api/owner/orders", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as OrdersResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || "Failed to load orders");
      }

      setClientName(data.client?.client_name || "");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to load orders.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  return (
    <OwnerShell
      title="Orders"
      description={clientName ? `${clientName} order queue.` : "Customer order queue."}
    >
      <div className="overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)]">
        {loading ? (
          <div className="px-5 py-5 text-[14px] text-[var(--text-muted)]">
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="px-5 py-5 text-[14px] leading-6 text-[var(--text-muted)]">
            No orders yet. New confirmed orders will appear here.
          </div>
        ) : (
          <div>
            {orders.map((order) => (
              <article
                key={order.id}
                className="border-t border-[var(--border)] bg-background px-5 py-4 first:border-t-0"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-[1rem] font-bold text-[var(--text-primary)]">
                        {order.customer_name || `Customer ${order.recipient_id}`}
                      </h2>
                      <span className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        {order.status}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-[var(--text-primary)]">
                      {order.order_summary}
                    </p>
                    <div className="mt-3 grid gap-2 text-[12px] text-[var(--text-muted)] sm:grid-cols-2">
                      <p>Contact: {order.contact_number || "Not provided"}</p>
                      <p>Payment: {order.payment_method || "Not provided"}</p>
                      <p>Delivery: {order.delivery_method || "Not provided"}</p>
                      <p>Total: {order.total_amount === null ? "Not set" : order.total_amount}</p>
                    </div>
                    {order.delivery_address ? (
                      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                        Address: {order.delivery_address}
                      </p>
                    ) : null}
                    {order.notes ? (
                      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                        Notes: {order.notes}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-[var(--text-subtle)]">
                    {formatTimestamp(order.created_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </OwnerShell>
  );
}
