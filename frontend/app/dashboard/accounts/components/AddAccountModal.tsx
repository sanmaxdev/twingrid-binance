import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { accountsService } from "@/lib/services/accounts"

interface AddAccountModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function AddAccountModal({ isOpen, onOpenChange, onSuccess }: AddAccountModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    api_key: "",
    api_secret: "",
    is_testnet: false,
    exchange: "BINANCE_FUTURES",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.api_key || !formData.api_secret) {
      toast.error("Please fill in all required fields")
      return
    }

    try {
      setIsValidating(true)
      // First preview/validate the connection
      await accountsService.previewConnection({
        api_key: formData.api_key,
        api_secret: formData.api_secret,
        is_testnet: formData.is_testnet
      })

      // If valid, create the account
      setIsValidating(false)
      setIsSubmitting(true)
      await accountsService.createAccount(formData)
      
      toast.success("Account connected successfully")
      onOpenChange(false)
      onSuccess()
      
      // Reset form
      setFormData({
        name: "",
        api_key: "",
        api_secret: "",
        is_testnet: false,
        exchange: "BINANCE_FUTURES",
      })
    } catch (error: any) {
      console.error("Account connection error:", error);
      const msg = error?.message || "Failed to connect account";
      toast.error(msg);
    } finally {
      setIsValidating(false)
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect Binance Account</DialogTitle>
            <DialogDescription>
              Enter your Binance Futures API credentials. Ensure the API key has Futures trading enabled but Withdrawal permissions disabled.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Account Name / Alias
              </label>
              <Input
                id="name"
                placeholder="e.g. Main Trading Account"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="apiKey" className="text-sm font-medium">
                API Key
              </label>
              <Input
                id="apiKey"
                type="text"
                placeholder="Enter your Binance API Key"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="apiSecret" className="text-sm font-medium">
                API Secret
              </label>
              <Input
                id="apiSecret"
                type="password"
                placeholder="Enter your Binance API Secret"
                value={formData.api_secret}
                onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                required
              />
            </div>

            <div className="flex items-center space-x-2 mt-2">
              <input
                type="checkbox"
                id="testnet"
                checked={formData.is_testnet}
                onChange={(e) => setFormData({ ...formData, is_testnet: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="testnet" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Use Binance Testnet
              </label>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isValidating}>
              {isValidating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Connect Account"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
