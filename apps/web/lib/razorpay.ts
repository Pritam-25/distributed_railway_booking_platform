export interface RazorpayOptions {
  key: string
  amount: number
  currency?: string
  name?: string
  description?: string
  order_id?: string
  handler?: (response: {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }) => void | Promise<void>
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  theme?: {
    color?: string
  }
}

export interface RazorpayInstance {
  open: () => void
  on: (
    event: string,
    callback: (response: { error: { description: string } }) => void
  ) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

/**
 * ## loadRazorpayScript
 *
 * Dynamically injects the Razorpay Checkout JavaScript SDK (`https://checkout.razorpay.com/v1/checkout.js`)
 * into the document body if not already present.
 *
 * @returns Resolves `true` when the script loads successfully, `false` on failure.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false)
      return
    }

    if (window.Razorpay) {
      resolve(true)
      return
    }

    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}
