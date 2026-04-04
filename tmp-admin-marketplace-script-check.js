
      let adminMarketplacePassword = "";
      let adminMarketplaceData = {
        pendingListings: [],
        pendingPurchases: [],
      };

      function showMarketplaceToast(message, tone = "info") {
        const node = document.getElementById("admin-marketplace-toast");
        if (!node) return;
        node.classList.remove("hidden", "border-cyan-400/20", "bg-cyan-500/10", "text-cyan-100", "border-rose-400/20", "bg-rose-500/10", "text-rose-100");
        if (tone === "error") {
          node.classList.add("border-rose-400/20", "bg-rose-500/10", "text-rose-100");
        } else {
          node.classList.add("border-cyan-400/20", "bg-cyan-500/10", "text-cyan-100");
        }
        node.textContent = message;
      }

      function renderAdminMarketplace() {
        const listingsEl = document.getElementById("admin-marketplace-listings");
        const purchasesEl = document.getElementById("admin-marketplace-purchases");
        const listingCount = document.getElementById("admin-marketplace-listing-count");
        const purchaseCount = document.getElementById("admin-marketplace-purchase-count");
        const listings = adminMarketplaceData.pendingListings || [];
        const purchases = adminMarketplaceData.pendingPurchases || [];
        if (listingCount) listingCount.textContent = String(listings.length);
        if (purchaseCount) purchaseCount.textContent = String(purchases.length);
        if (listingsEl) {
          listingsEl.innerHTML = listings.length
            ? listings
                .map((item) => `
                  <article class="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <h4 class="text-lg font-semibold text-white">${item.title || "Untitled Listing"}</h4>
                        <p class="mt-2 text-sm leading-6 text-slate-400">${item.description || item.purpose || ""}</p>
                        <div class="mt-3 flex flex-wrap gap-4 text-[11px] font-semibold text-slate-500">
                          <span>${item.authorName || "Unknown Creator"}</span>
                          <span>${item.category || "General"}</span>
                          <span>${item.price > 0 ? `$${Number(item.price).toFixed(2)}` : "Free"}</span>
                        </div>
                      </div>
                      <div class="flex gap-2">
                        <button onclick="updateMarketplaceListing('${item._id}', 'approved')" class="rounded-2xl bg-cyan-400 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-300">Approve</button>
                        <button onclick="updateMarketplaceListing('${item._id}', 'sold')" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-100 hover:bg-white/10">Mark Sold</button>
                      </div>
                    </div>
                  </article>`)
                .join("")
            : `<div class="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-slate-400">No pending listings right now.</div>`;
        }
        if (purchasesEl) {
          purchasesEl.innerHTML = purchases.length
            ? purchases
                .map((item) => `
                  <article class="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <h4 class="text-lg font-semibold text-white">${item.title || "Untitled Purchase"}</h4>
                        <p class="mt-2 text-sm text-slate-400">${item.buyerName || "Unknown Buyer"} • ${item.buyerEmail || ""}</p>
                        <p class="mt-2 text-[11px] font-semibold text-slate-500">${item.price > 0 ? `$${Number(item.price).toFixed(2)}` : "Free"} • ${item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown time"}</p>
                      </div>
                      <div class="flex gap-2">
                        <button onclick="updateMarketplacePurchase('${item.itemId}', '${item.purchaseId}', 'approved')" class="rounded-2xl bg-emerald-400 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-950 hover:bg-emerald-300">Approve Transfer</button>
                        <button onclick="updateMarketplacePurchase('${item.itemId}', '${item.purchaseId}', 'failed')" class="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-rose-100 hover:bg-rose-500/20">Fail</button>
                      </div>
                    </div>
                  </article>`)
                .join("")
            : `<div class="rounded-[1.6rem] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-slate-400">No pending purchases right now.</div>`;
        }
      }

      async function fetchAdminMarketplace() {
        const res = await fetch("/api/admin/marketplace", {
          headers: { "x-admin-password": adminMarketplacePassword },
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Could not load marketplace admin data.");
        }
        adminMarketplaceData = data;
        renderAdminMarketplace();
      }

      async function unlockMarketplaceAdmin() {
        const password = String(document.getElementById("admin-marketplace-password")?.value || "").trim();
        if (!password) return;
        adminMarketplacePassword = password;
        try {
          await fetchAdminMarketplace();
          document.getElementById("admin-marketplace-auth")?.classList.add("hidden");
          document.getElementById("admin-marketplace-auth-error")?.classList.add("hidden");
          showMarketplaceToast("Marketplace admin unlocked.");
        } catch (error) {
          document.getElementById("admin-marketplace-auth-error")?.classList.remove("hidden");
        }
      }

      async function updateMarketplaceListing(id, status) {
        try {
          const res = await fetch(`/api/admin/marketplace/${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminMarketplacePassword,
            },
            body: JSON.stringify({ status }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "Could not update this listing.");
          }
          showMarketplaceToast(data.message || "Listing updated.");
          await fetchAdminMarketplace();
        } catch (error) {
          showMarketplaceToast(error.message || "Could not update this listing.", "error");
        }
      }

      async function updateMarketplacePurchase(itemId, purchaseId, status) {
        try {
          const res = await fetch(`/api/admin/marketplace/${itemId}/purchases/${purchaseId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminMarketplacePassword,
            },
            body: JSON.stringify({ status }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "Could not update this purchase.");
          }
          showMarketplaceToast(data.message || "Purchase updated.");
          await fetchAdminMarketplace();
        } catch (error) {
          showMarketplaceToast(error.message || "Could not update this purchase.", "error");
        }
      }
    