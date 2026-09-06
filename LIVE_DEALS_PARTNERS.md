# Live deals — partner options (not Honey scrape)

Scout packet 2026-08-26. Illustrative matcher stays until a publisher account exists. Do not scrape. Do not invent tokens.

## The 3 (dropped the rest)

1. **CJ Affiliate Link Search**  
   Publisher REST for promo links (`promotion-type=coupon`, `coupon-code`).  
   Docs: https://developers.cj.com/docs/rest-apis/link-search  
   Risk: CJ publisher account + token. Inventory is joined advertisers (chains), not OSM independents.

2. **Awin Offers / Promotions**  
   `POST /publisher/{publisherId}/promotions` — promotions and voucher codes, tracking URL.  
   Docs: https://help.awin.com/apidocs/promotions · intro https://developer.awin.com/apidocs/introduction  
   Risk: publisher token. Voucher `code` is null until you join the advertiser. 20 calls/min.

3. **Impact Partner Promotions / Promo Codes**  
   Brand promotions (`GenericRedemptionCode`) and assigned promo codes.  
   Docs: https://integrations.impact.com/partner-api-reference/partner-v15/reference/promotions/promotions  
   https://integrations.impact.com/partner-api-reference/partner-v15/reference/promo-codes/promo-codes  
   Risk: Impact partner account. Codes are brand-issued, not a local-restaurant feed.

No fourth. Groupon developer pages 403; remaining Groupon APIs are merchant booking-into-Groupon, not a publisher restaurant-deal feed.
