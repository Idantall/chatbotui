import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { apiRequest } from "@/lib/queryClient";
import { Send, User, Bot, Lightbulb, Code, HelpCircle, Sparkles } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Bootstrap thread on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/thread', { method: 'POST' });
        const data = await r.json();
        setThreadId(data.threadId);
        console.log('Bootstrapped threadId:', data.threadId);
      } catch (e) {
        console.error('Failed to create thread:', e);
      }
    })();
  }, []);

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!threadId) {
        throw new Error('No thread ID available');
      }
      
      try {
        console.log('Sending with threadId:', threadId);
        const response = await apiRequest("POST", "/api/chat", { 
          user: text, 
          threadId: threadId 
        });
        const data = await response.json();
        
        // Ensure we have a valid response structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format');
        }
        
        console.log('Response threadId:', data.threadId); // should echo same id
        return data;
      } catch (error) {
        console.error('API request failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      // More robust data handling
      const responseText = data?.text || data?.message || "(no reply)";
      
      const assistantMessage: Message = {
        id: Date.now().toString() + "-assistant",
        role: "assistant",
        text: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    },
    onError: (error: any) => {
      console.error('Message send error:', error);
      
      let errorMessage = "Failed to send message. Please try again.";
      
      // Try to extract more specific error information
      if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
      setIsTyping(false);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const startNewChat = async () => {
    setMessages([]);
    setThreadId(null);
    setInput("");
    // Re-bootstrap a fresh thread:
    try {
      const r = await fetch('/api/thread', { method: 'POST' });
      const data = await r.json();
      setThreadId(data.threadId);
      console.log('New chat - threadId:', data.threadId);
    } catch (e) {
      console.error('Failed to create new thread:', e);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !threadId || sendMessageMutation.isPending) return; // ensure threadId exists

    const userMessage: Message = {
      id: Date.now().toString() + "-user",
      role: "user",
      text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);
    sendMessageMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const quickActions = [
    { icon: Lightbulb, label: "Get Ideas", prompt: "Can you give me some creative ideas?" },
    { icon: Code, label: "Code Help", prompt: "I need help with coding. Can you assist?" },
    { icon: HelpCircle, label: "Ask Question", prompt: "I have a question about..." },
    { icon: Sparkles, label: "Creative", prompt: "Help me brainstorm something creative" },
  ];

  return (
    <div className="app-container flex flex-col h-screen max-w-4xl mx-auto bg-background">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-6 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="text-primary w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Assistant Chat</h1>
              <p className="text-sm text-muted-foreground">AI-powered conversation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              disabled={sendMessageMutation.isPending}
              className="h-8 px-3 text-xs"
              data-testid="new-chat-button"
            >
              New Chat
            </Button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Container */}
      <main className="chat-container flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="chat-container">
        {messages.length === 0 && (
          <div className="flex justify-center mb-8">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Bot className="text-primary w-8 h-8" />
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">Welcome to Assistant Chat</h2>
              <p className="text-sm text-muted-foreground">Start a conversation with your AI assistant. Ask questions, get help, or just chat!</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} mb-4 animate-fade-in`}
            data-testid={`message-${message.role}-${message.id}`}
          >
            <div className="flex items-end gap-3 max-w-[85%] sm:max-w-[70%]">
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                  <Bot className="text-white w-4 h-4" />
                </div>
              )}
              <div
                className={`px-4 py-3 shadow-sm ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                    : "bg-card border border-border rounded-2xl rounded-bl-md"
                }`}
              >
                <p className={`text-sm leading-relaxed ${message.role === "assistant" ? "text-card-foreground" : ""}`}>
                  {message.text}
                </p>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="text-primary w-4 h-4" />
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </main>

      {/* Message Composer */}
      <div className="flex-shrink-0 p-4 border-t border-border bg-card/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-3 items-end" data-testid="message-form">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
              data-testid="message-input"
            />
          </div>
          <Button
            type="submit"
            disabled={!input.trim() || !threadId || sendMessageMutation.isPending}
            className="w-11 h-11 p-0"
            data-testid="send-button"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>

        {/* Quick Action Buttons */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.label}
                variant="secondary"
                size="sm"
                onClick={() => handleQuickAction(action.prompt)}
                className="flex-shrink-0 text-xs font-medium"
                data-testid={`quick-action-${action.label.toLowerCase().replace(' ', '-')}`}
              >
                <Icon className="w-3 h-3 mr-1" />
                {action.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
