import { motion } from 'framer-motion'
import { Phone, Clock, TrendingDown, Users, Bot, Star, CheckCircle, ArrowRight, Calendar, X, ChevronLeft, ChevronRight, Video, Monitor, MessageCircle, Menu, Shield, Zap, Headphones, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useEffect } from 'react'

interface BookingData {
  name: string;
  email: string;
  date: string;
  time: string;
  meetingType: 'phone' | 'zoom' | 'teams';
  phone?: string;
  id: string;
}

function App() {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{date: string, time: string} | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    meetingType: 'phone' as 'phone' | 'zoom' | 'teams'
  });
  const [voiceSamples, setVoiceSamples] = useState<Array<{ name: string; file: string; description?: string; voiceId?: string }>>([]);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/voice-samples/voice-config.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.voices)) {
            const niceNames: Record<string,string> = {
              zephyr: 'Zephyr (warm & freundlich)',
              puck: 'Puck (hell & agil)',
              charon: 'Charon (ruhig & seriös)',
              kore: 'Kore (klar & professionell)',
              fenrir: 'Fenrir (kräftig & präsent)',
              leda: 'Leda (sanft & natürlich)'
            };
            setVoiceSamples(
              data.voices.map((v: any) => ({
                ...v,
                voiceId: (v.voiceName || v.voice || v.file?.match(/([a-z]+)\.(wav|mp3)$/)?.[1] || '').toLowerCase(),
                name: niceNames[(v.voiceName || v.voice || v.file?.match(/([a-z]+)\.(wav|mp3)$/)?.[1] || '').toLowerCase()] || v.name
              }))
            );
      return;
    }
        }
      } catch {}
      // Fallback auf erwartete Dateien, falls JSON fehlt
      const labels: Record<string,string> = {
        zephyr: 'Zephyr (warm & freundlich)',
        puck: 'Puck (hell & agil)',
        charon: 'Charon (ruhig & seriös)',
        kore: 'Kore (klar & professionell)',
        fenrir: 'Fenrir (kräftig & präsent)',
        leda: 'Leda (sanft & natürlich)'
      };
      const fallback = ["zephyr","puck","charon","kore","fenrir","leda"].map(n => ({
        name: labels[n] || (n.charAt(0).toUpperCase() + n.slice(1)),
        file: `/voice-samples/${n}.wav`,
        description: 'KI‑Stimme',
        voiceId: n
      }));
      setVoiceSamples(fallback);
    })();
  }, []);


  // Lade gespeicherte Termine aus localStorage
  // API: Buchungen für aktuelle Woche laden
  const formatYMD = (d: Date) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
  const refreshWeekBookings = async (baseDate?: Date) => {
    try {
      const base = baseDate || currentWeek;
      const ws = getWeekStart(base);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const from = formatYMD(ws);
      const to = formatYMD(we);
      const res = await fetch(`/api/bookings?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setBookings(data);
      }
    } catch {}
  };

  useEffect(() => {
    refreshWeekBookings();
  }, [currentWeek]);




  const isSlotAvailable = (date: string, time: string) => {
    return !bookings.some(booking => 
      booking.date === date && booking.time === time
    );
  };

  const handleSlotClick = (date: string, time: string) => {
    if (isSlotAvailable(date, time)) {
      setSelectedSlot({ date, time });
      setIsBookingModalOpen(true);
    }
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !selectedSlot) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    if (formData.meetingType === 'phone' && !formData.phone) {
      alert('Bitte geben Sie Ihre Telefonnummer an.');
      return;
    }

    const newBooking: BookingData = {
      ...formData,
      date: selectedSlot.date,
      time: selectedSlot.time,
      phone: formData.meetingType === 'phone' ? formData.phone : undefined,
      id: Date.now().toString()
    };

    // An Backend senden (mit Konfliktprüfung)
    try {
      const resp = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBooking.name,
          email: newBooking.email,
          phone: newBooking.phone,
          date: newBooking.date,
          time: newBooking.time,
          meetingType: newBooking.meetingType
        })
      });
      if (resp.status === 409) {
        alert('Leider wurde dieser Termin gerade belegt. Bitte wählen Sie einen anderen Slot.');
        return;
      }
      if (!resp.ok) {
        alert('Buchung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        return;
      }
      await refreshWeekBookings();
    } catch {
      alert('Netzwerkfehler. Bitte versuchen Sie es erneut.');
      return;
    }
    
    // Reset form
    setFormData({ name: '', email: '', phone: '', meetingType: 'phone' });
    setSelectedSlot(null);
    setIsBookingModalOpen(false);
    
    const meetingTypeText = {
      phone: 'rufen Sie an',
      zoom: 'senden Ihnen einen Zoom-Link',
      teams: 'senden Ihnen einen Teams-Link'
    };
    
    alert(`Termin erfolgreich gebucht! Wir ${meetingTypeText[newBooking.meetingType]} zur vereinbarten Zeit.`);
  };

  // Wochennavigation
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Montag als erster Tag
    return new Date(d.setDate(diff));
  };

  const getWeekDays = (startDate: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const previousWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(newWeek);
  };

  const nextWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(newWeek);
  };

  const scrollToCalendar = () => {
    const calendarSection = document.getElementById('calendar-section');
    if (calendarSection) {
      calendarSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Wochenkalender rendern
  const renderWeekCalendar = () => {
    const weekStart = getWeekStart(currentWeek);
    const weekDays = getWeekDays(weekStart);
    const today = new Date();
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    // Alle möglichen Uhrzeiten (7-15 Uhr bzw. 7-13 Uhr Samstag)
    const timeHours = Array.from({ length: 9 }, (_, i) => 7 + i); // 7-15 Uhr

    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-2xl font-bold text-gray-900">
            <span className="hidden sm:inline">
            {weekStart.getDate()}. {monthNames[weekStart.getMonth()]} - {weekDays[6].getDate()}. {monthNames[weekDays[6].getMonth()]} {weekStart.getFullYear()}
            </span>
            <span className="sm:hidden">
              {weekStart.getDate()}.{(weekStart.getMonth() + 1).toString().padStart(2, '0')} - {weekDays[6].getDate()}.{(weekDays[6].getMonth() + 1).toString().padStart(2, '0')}.{weekStart.getFullYear()}
            </span>
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={previousWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={nextWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header mit Wochentagen */}
            <div className="grid grid-cols-8 gap-1 mb-2">
              <div className="p-1 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-500">Zeit</div>
              {weekDays.map((day, index) => {
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <div key={index} className={`p-1 sm:p-2 text-center text-xs sm:text-sm font-medium ${isToday ? 'text-primary-600 bg-primary-50' : 'text-gray-500'} rounded`}>
                    <div className="text-xs sm:text-sm">{dayNames[index]}</div>
                    <div className="text-xs">{day.getDate()}.{(day.getMonth() + 1).toString().padStart(2, '0')}</div>
                  </div>
                );
              })}
            </div>

            {/* Stunden-Grid */}
            {timeHours.map(hour => (
              <div key={hour} className="grid grid-cols-8 gap-1 mb-1">
                <div className="p-1 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-600 bg-gray-50 rounded">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {weekDays.map((day) => {
                  const dateString = `${day.getFullYear()}-${(day.getMonth() + 1).toString().padStart(2, '0')}-${day.getDate().toString().padStart(2, '0')}`;
                  const timeString = `${hour.toString().padStart(2, '0')}:00`;
                  const isPast = day < today || (day.toDateString() === today.toDateString() && hour <= new Date().getHours());
                  const dayOfWeek = day.getDay();
                  
                  // Prüfe Öffnungszeiten
                  const isOpen = dayOfWeek !== 0 && // Nicht Sonntag
                                 ((dayOfWeek === 6 && hour < 13) || // Samstag bis 13 Uhr
                                  (dayOfWeek !== 6 && hour < 15));   // Rest bis 15 Uhr

                  const isAvailable = isOpen && !isPast && isSlotAvailable(dateString, timeString);
                  const isBooked = isOpen && bookings.some(booking => 
                    booking.date === dateString && booking.time === timeString
                  );

                  return (
                    <div key={`${dateString}-${timeString}`} className="p-0.5 sm:p-1">
                      {isOpen ? (
                        <button
                          onClick={() => isAvailable ? handleSlotClick(dateString, timeString) : undefined}
                          disabled={!isAvailable}
                          className={`w-full h-8 sm:h-10 rounded text-xs font-medium transition-colors leading-tight
                            ${isAvailable 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer' 
                              : isBooked 
                                ? 'bg-red-100 text-red-700 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                          <span className="text-xs sm:text-sm">
                          {isAvailable ? 'Frei' : isBooked ? 'Belegt' : 'Vorbei'}
                          </span>
                        </button>
                      ) : (
                        <div className="w-full h-8 sm:h-10 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
                          <span className="text-xs leading-tight text-center">
                            {dayOfWeek === 0 ? 'Geschl.' : 'Geschl.'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">Verfügbar</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-600">Belegt</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-gray-600">Geschlossen</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* JSON-LD: Service & Breadcrumbs for SEO */}
      {(() => {
        const serviceJsonLd = {
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Voice Agent (KI‑Telefonassistent)",
          provider: { "@type": "Organization", name: "Vocaris Solutions", url: "https://vocaris-solutions.de/" },
          areaServed: ["DE", "AT", "CH"],
          audience: { "@type": "BusinessAudience", name: "B2B" },
          offers: { "@type": "Offer", priceCurrency: "EUR", availability: "https://schema.org/InStock" }
        };
        const breadcrumbJsonLd = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Start", item: "https://vocaris-solutions.de/" },
            { "@type": "ListItem", position: 2, name: "Use Cases", item: "https://vocaris-solutions.de/#use-cases-section" },
            { "@type": "ListItem", position: 3, name: "Preise", item: "https://vocaris-solutions.de/#preise-section" }
          ]
        };
        return (
          <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
          </>
        );
      })()}
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-gray-600/30 backdrop-blur-md z-50 border-b border-gray-300/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-2"
            >
              <Bot className="h-8 w-8 text-blue-400" />
              <span className="font-bold text-xl text-black">Vocaris AI</span>
            </motion.div>
            
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => document.getElementById('use-cases-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-black hover:text-gray-900 transition-colors font-medium"
              >
                Use Cases
              </button>
              <button
                onClick={() => document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-black hover:text-gray-900 transition-colors font-medium"
              >
                Demo
              </button>
              <button
                onClick={() => document.getElementById('preise-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-black hover:text-gray-900 transition-colors font-medium"
              >
                Preise
              </button>
              <button
                onClick={() => document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-black hover:text-gray-900 transition-colors font-medium"
              >
                FAQ
              </button>
              <button
                onClick={scrollToCalendar}
                className="text-black hover:text-gray-900 transition-colors font-medium"
              >
                Kontakt
              </button>
              <a href="/impressum.html" className="text-black hover:text-gray-900 transition-colors font-medium">Impressum</a>
              <a href="/agb.html" className="text-black hover:text-gray-900 transition-colors font-medium">AGB</a>
              <a href="/datenschutz.html" className="text-black hover:text-gray-900 transition-colors font-medium">Datenschutz</a>
            </div>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-black hover:text-gray-900 transition-colors"
            >
              <Menu className="h-6 w-6 text-black" />
            </button>
            
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={scrollToCalendar}
              className="hidden md:block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-glow"
            >
              Kostenlos Termin buchen
            </motion.button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden bg-white border-t border-gray-100 shadow-lg"
          >
            <div className="px-4 py-4 space-y-3">
              <button
                onClick={() => {
                  document.getElementById('use-cases-section')?.scrollIntoView({ behavior: 'smooth' });
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-4 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Use Cases
              </button>
              <button
                onClick={() => {
                  document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' });
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-4 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Demo
              </button>
              <button
                onClick={() => {
                  document.getElementById('preise-section')?.scrollIntoView({ behavior: 'smooth' });
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-4 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Preise
              </button>
              <button
                onClick={() => {
                  document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' });
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-4 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                FAQ
              </button>
              <button
                onClick={() => {
                  scrollToCalendar();
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left py-3 px-4 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Kontakt
              </button>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-20 md:pt-24 pb-12 md:pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold text-gray-900 mb-4 md:mb-6"
            >
              Automatisieren Sie Ihren
              <span className="gradient-text block">Kundenservice mit KI</span>
              <span className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl block mt-2 md:mt-4">und sparen Sie 85% der Kosten</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 mb-8 md:mb-12 max-w-4xl mx-auto px-2"
            >
              Unser KI-Telefonsystem ist 24/7 erreichbar, führt automatisch Buchungen durch 
              und spart Ihnen bis zu 85% der Kundenservice-Kosten
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center"
            >
              <button 
                onClick={scrollToCalendar}
                className="bg-primary-600 text-white px-4 sm:px-6 md:px-8 py-3 md:py-4 rounded-lg md:rounded-xl font-semibold text-sm sm:text-base md:text-lg hover:bg-primary-700 transition-colors shadow-glow flex items-center justify-center group"
              >
                <Calendar className="mr-2 h-4 md:h-5 w-4 md:w-5" />
                Kostenlos Beratungstermin buchen
                <ArrowRight className="ml-2 h-4 md:h-5 w-4 md:w-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="border-2 border-gray-300 text-gray-700 px-4 sm:px-6 md:px-8 py-3 md:py-4 rounded-lg md:rounded-xl font-semibold text-sm sm:text-base md:text-lg hover:border-primary-600 hover:text-primary-600 transition-colors">
                Live-Demo anfordern
              </button>
            </motion.div>
          </div>


        </div>
      </section>

      {/* Problem Section */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-8 md:mb-16"
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 md:mb-6">
              Das Problem kennen Sie
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto px-2">
              Jeden Tag verlieren Unternehmen wertvolle Kunden, weil der Telefonservice überlastet ist
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-4 gap-4 md:gap-8">
            {[
              { icon: Phone, title: "Verpasste Anrufe", desc: "Besetzt oder niemand da", color: "text-red-500" },
              { icon: Clock, title: "Lange Wartezeiten", desc: "Kunden legen auf", color: "text-orange-500" },
              { icon: TrendingDown, title: "Umsatzverluste", desc: "30% weniger Buchungen", color: "text-red-600" },
              { icon: Users, title: "Überlastetes Personal", desc: "Stress und Fehler", color: "text-yellow-500" }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-4 md:p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <item.icon className={`h-8 md:h-12 w-8 md:w-12 ${item.color} mb-3 md:mb-4`} />
                <h3 className="font-semibold text-base md:text-lg text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm md:text-base text-gray-600">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo-section" className="py-10 md:py-16 lg:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-6 md:mb-8 lg:mb-12"
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-3 md:mb-4 lg:mb-6">
              Erleben Sie unsere <span className="gradient-text">KI live</span>
            </h2>
            <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-600 max-w-3xl mx-auto mb-6 md:mb-8 px-2">
              Testen Sie jetzt unseren Voice-Agent und erleben Sie, wie natürlich und effizient KI-basierter Kundenservice funktioniert
            </p>

            {/* Test Telefonnummer */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl shadow-lg max-w-sm md:max-w-md mx-auto mb-8 md:mb-12"
            >
              <div className="flex items-center justify-center mb-3 md:mb-4">
                <Phone className="h-6 md:h-8 w-6 md:w-8 text-primary-600 mr-2 md:mr-3" />
                    <div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-900">Test Voice Agent</h3>
                  <p className="text-xs md:text-sm text-gray-600">Rufen Sie an und testen Sie live</p>
                    </div>
                  </div>
              <div className="text-center">
                <a 
                  href="tel:+18624538419" 
                  className="text-xl md:text-3xl font-bold text-primary-600 hover:text-primary-700 transition-colors block"
                >
                  +1 862 453-8419
                </a>
                <p className="text-xs md:text-sm text-gray-500 mt-2">
                  24/7 verfügbar · Kostenloser Test
                </p>
                    </div>
            </motion.div>
            
            {/* Voice Agent Metriken */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
              className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8 md:mb-12"
            >
              <div className="bg-white p-3 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-gray-200 text-center">
                <div className="text-xl md:text-3xl font-bold text-blue-600 mb-1 md:mb-2">24+</div>
                <div className="text-xs md:text-sm font-medium text-gray-900 mb-1">Sprachen</div>
                <div className="text-xs text-gray-600 hidden md:block">Automatische Erkennung</div>
                  </div>
              <div className="bg-white p-3 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-gray-200 text-center">
                <div className="text-xl md:text-3xl font-bold text-blue-600 mb-1 md:mb-2">30+</div>
                <div className="text-xs md:text-sm font-medium text-gray-900 mb-1">Stimmen</div>
                <div className="text-xs text-gray-600 hidden md:block">Verfügbare Varianten</div>
                    </div>
              <div className="bg-white p-3 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-gray-200 text-center">
                <div className="text-xl md:text-3xl font-bold text-blue-600 mb-1 md:mb-2">&lt;300ms</div>
                <div className="text-xs md:text-sm font-medium text-gray-900 mb-1">Latenz</div>
                <div className="text-xs text-gray-600 hidden md:block">Ultraschnelle Antworten</div>
                  </div>
              <div className="bg-white p-3 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-gray-200 text-center">
                <div className="text-xl md:text-3xl font-bold text-blue-600 mb-1 md:mb-2">99.9%</div>
                <div className="text-xs md:text-sm font-medium text-gray-900 mb-1">Qualität</div>
                <div className="text-xs text-gray-600 hidden md:block">Natürlichste Stimme</div>
              </div>
            </motion.div>

            {/* Technologie Features - Professionell */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              viewport={{ once: true }}
              className="bg-white border border-gray-200 p-6 md:p-8 rounded-xl shadow-lg max-w-5xl mx-auto"
            >
              <h4 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 text-center">Enterprise-Grade Technologie</h4>
              
              {/* Kernfeatures */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Zap className="h-6 w-6 text-blue-600" />
                </div>
                  <h5 className="font-semibold text-gray-900 mb-1">Native Audio-Verarbeitung</h5>
                  <p className="text-sm text-gray-600">Echtzeit-Streaming ohne Latenz</p>
                  </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Brain className="h-6 w-6 text-gray-700" />
                  </div>
                  <h5 className="font-semibold text-gray-900 mb-1">Multimodale Intelligenz</h5>
                  <p className="text-sm text-gray-600">Neueste KI-Generation</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="h-6 w-6 text-blue-600" />
                  </div>
                  <h5 className="font-semibold text-gray-900 mb-1">Kontextbewusstes Gespräch</h5>
                  <p className="text-sm text-gray-600">Mehrere Turns & Gedächtnis</p>
                  </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Headphones className="h-6 w-6 text-gray-700" />
                  </div>
                  <h5 className="font-semibold text-gray-900 mb-1">Emotionale Nuancen</h5>
                  <p className="text-sm text-gray-600">Natürliche Intonation</p>
                </div>
              </div>

              {/* Sicherheit kompakt */}
              <div className="border-t border-gray-200 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center text-gray-700">
                    <Shield className="h-4 w-4 text-blue-600 mr-3" />
                    <span>DSGVO-konforme Verarbeitung</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Shield className="h-4 w-4 text-blue-600 mr-3" />
                    <span>End-to-End Verschlüsselung</span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Shield className="h-4 w-4 text-blue-600 mr-3" />
                    <span>Enterprise-Sicherheitsstandards</span>
                  </div>
                </div>
              </div>

              {/* Voice Samples (nur anzeigen, wenn vorhanden) */}
              {voiceSamples.length > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <h5 className="text-lg font-semibold text-gray-900 mb-4 text-center">Stimmen-Portfolio</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {voiceSamples.slice(0,6).map((v, i) => {
                      const isWav = v.file?.endsWith('.wav');
                      const audioType = isWav ? 'audio/wav' : 'audio/mpeg';
                      return (
                        <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
                          <div className="text-sm font-medium text-gray-900 mb-2 truncate">{v.name}</div>
                          <audio controls preload="none" className="w-full h-10">
                            <source src={v.file} type={audioType} />
                          </audio>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
            </motion.div>
          </div>
      </section>

      {/* Service Excellence Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Rundum-sorglos <span className="gradient-text">Komplettservice</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto">
              Von der ersten Beratung bis zum laufenden Betrieb – wir begleiten Sie bei jedem Schritt
            </p>
          </motion.div>

          {/* Service-Schritte kompakt (mobile tighter) */}
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
              {[
                {
                  step: "1",
                  title: "Individuelle Beratung",
                  desc: "Wir analysieren Ihre Prozesse und nehmen Ihre Wünsche auf. Der Kunde entscheidet über alle Details.",
                  icon: Users
                },
                {
                  step: "2",
                  title: "Voice Agent Entwicklung",
                  desc: "Maßgeschneiderte Entwicklung mit individuellen Gesprächsabläufen und Integrationen.",
                  icon: Bot
                },
                {
                  step: "3",
                  title: "Telefonnummer & Setup",
                  desc: "Kostenfreie Bereitstellung und Konfiguration Ihrer geschäftlichen Rufnummer.",
                  icon: Phone
                },
                {
                  step: "4",
                  title: "API-Integration",
                  desc: "Nahtlose Anbindung an Ihre bestehenden Systeme für automatische Workflows.",
                  icon: CheckCircle
                },
                {
                  step: "5",
                  title: "Go-Live & Support",
                  desc: "Nach Tests geht Ihr Voice Agent live. 24/7 Premium Support inklusive.",
                  icon: Star
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-white p-4 md:p-6 rounded-lg md:rounded-xl shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3 md:mb-4">
                    <item.icon className="h-5 w-5 md:h-6 md:w-6 text-gray-700" />
                  </div>
                  <div className="inline-flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-600 text-white text-sm md:text-base font-bold mb-2 md:mb-3">
                    {item.step}
                  </div>
                  <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2 md:mb-3">{item.title}</h3>
                  <p className="text-xs md:text-sm text-gray-600">{item.desc}</p>
                </motion.div>
              ))}
                  </div>
                </div>

          {/* Service Highlights */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            viewport={{ once: true }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-bold text-gray-900 mb-2">Keine Einrichtungskosten</h4>
              <p className="text-sm text-gray-600">Setup, Konfiguration und Testphase vollständig kostenfrei</p>
          </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-bold text-gray-900 mb-2">24/7 Premium Support</h4>
              <p className="text-sm text-gray-600">Expertenteam steht Ihnen rund um die Uhr zur Verfügung</p>
            </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 text-center shadow-sm">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ArrowRight className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="font-bold text-gray-900 mb-2">unter 1 Woche</h4>
                <p className="text-sm text-gray-600">Von der Beratung bis zum Go-Live in unter 1 Woche</p>
              </div>
          </motion.div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases-section" className="py-10 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-8 md:mb-12"
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-3 md:mb-4">Use Cases nach Branche</h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 max-w-3xl mx-auto px-2">
              So setzen Unternehmen Vocaris AI gewinnbringend ein – von Kundenservice bis Terminmanagement.
            </p>
          </motion.div>

          {/* Mobile: 3-stöckiges Karussell, Desktop: Grid */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { 
                title: "Kundenservice", 
                items: [
                  "Automatisierte FAQs & Ticketanlage",
                  "Intelligentes Routing an Teams",
                  "Rückrufe & Status‑Updates"
                ],
                kpi: "24/7 Support, reduzierte Wartezeiten (vgl. Tenios)"
              },
              { 
                title: "Marketing & Sales", 
                items: [
                  "Lead‑Qualifizierung in Echtzeit",
                  "Follow‑ups per E‑Mail/SMS",
                  "CRM‑Einträge automatisch"
                ],
                kpi: "Schnellere Reaktionszeiten, höhere Conversion (vgl. Tenios)"
              },
              { 
                title: "Healthcare", 
                items: [
                  "Terminverwaltung & Erinnerungen",
                  "Patientenanfragen vorqualifizieren",
                  "Befund‑/Hinweisweitergabe"
                ],
                kpi: "Bis zu −40% Terminausfälle durch Erinnerungen (Quelle: Doctolib³)"
              },
              { 
                title: "Banken & Finanzen", 
                items: [
                  "Zahlungserinnerungen & Mahnwesen",
                  "Kundenverifizierung",
                  "Kreditanfragen aufnehmen"
                ],
                kpi: "Sichere Prozesse, mehrsprachige Kommunikation (vgl. Tenios)"
              },
              { 
                title: "Logistik", 
                items: [
                  "Sendungsstatus abfragen",
                  "Abhol‑/Liefertermine koordinieren",
                  "Proaktive Zustell‑Benachrichtigungen"
                ],
                kpi: "Weniger Nachfragen, transparente Kommunikation"
              },
              { 
                title: "E‑Commerce & Dienstleister", 
                items: [
                  "Bestellungen aufnehmen & weiterleiten",
                  "Termin‑/Ressourcenplanung",
                  "Rückfragen automatisiert beantworten"
                ],
                kpi: "+Verkäufe durch sofortige Erreichbarkeit"
              },
              { 
                title: "Immobilienmakler", 
                items: [
                  "Besichtigungstermine koordinieren",
                  "Interessentenanfragen vorqualifizieren",
                  "Exposé‑Versendung automatisieren"
                ],
                kpi: "Höhere Conversion bei Immobilienanfragen"
              },
              { 
                title: "Rechtsanwälte & Steuerberater", 
                items: [
                  "Mandantenanfragen strukturiert erfassen",
                  "Termine für Erstberatung koordinieren",
                  "Fachbereich‑spezifisches Routing"
                ],
                kpi: "Professioneller Erstkontakt, weniger Admin‑Aufwand"
              },
              { 
                title: "Handwerk & Reparaturdienste", 
                items: [
                  "Notfall‑ & Serviceanfragen priorisieren",
                  "Techniker‑Verfügbarkeit abgleichen",
                  "Kostenvoranschläge koordinieren"
                ],
                kpi: "Schnellere Reaktion bei Notfällen, bessere Auslastung"
              }
            ].map((uc, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: idx * 0.05 }}
                viewport={{ once: true }}
                  className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl shadow-sm border border-gray-100"
              >
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3 md:mb-4">{uc.title}</h3>
                  <ul className="space-y-2 mb-3 md:mb-4">
                  {uc.items.map((it, i) => (
                    <li key={i} className="flex items-start">
                        <CheckCircle className="h-3 md:h-4 w-3 md:w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700 text-xs md:text-sm">{it}</span>
                    </li>
                  ))}
                </ul>
                  <div className="text-xs md:text-sm text-gray-500">{uc.kpi}</div>
              </motion.div>
            ))}
          </div>

          {/* Mobile Use Cases - 3 Stockwerke Karussell */}
          <div className="md:hidden space-y-3 overflow-hidden">
            {(() => {
              const useCaseRows = [
                [
                  { title: "Kundenservice", items: ["Anrufe entgegennehmen", "FAQ beantworten", "Weiterleitung"], kpi: "24/7 erreichbar" },
                  { title: "Reservierungen", items: ["Tisch/Termin buchen", "Bestätigungen senden", "Stornierungen"], kpi: "+30% Buchungen" },
                  { title: "Leads", items: ["Kontakt erfassen", "Qualifikation", "Rückruf ansetzen"], kpi: "+40% Conversion" }
                ],
                [
                  { title: "E-Commerce", items: ["Bestellungen aufnehmen", "Versandstatus", "Rückgaben"], kpi: "+25% Umsatz" },
                  { title: "Healthcare", items: ["Termine koordinieren", "Erinnerungen", "Notfälle"], kpi: "-40% Ausfälle" },
                  { title: "Immobilien", items: ["Besichtigungen", "Anfragen", "Dokumentation"], kpi: "Mehr Leads" }
                ],
                [
                  { title: "Finanzen", items: ["Kontoservice", "Beratung", "Zahlungserinnerungen"], kpi: "Sicher & schnell" },
                  { title: "Handwerk", items: ["Notrufe priorisieren", "Terminplanung", "Kostenvoranschläge"], kpi: "Bessere Auslastung" },
                  { title: "Rechtsanwälte", items: ["Mandantenanfragen", "Erstberatung", "Terminkoordination"], kpi: "Professionell" }
                ]
              ];

              return useCaseRows.map((rowData, rowIndex) => (
                <div
                  key={rowIndex}
                  className="relative overflow-hidden"
                  style={{ '--marquee-duration': '30s' } as React.CSSProperties}
                >
                  <div className={`flex ${rowIndex === 1 ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
                    {/* Erste Instanz */}
                    <div className="flex shrink-0 gap-4 pr-4">
                      {rowData.map((uc, idx) => (
                        <div key={`${rowIndex}-${idx}`} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 w-64 shrink-0">
                          <h3 className="text-sm font-bold text-gray-900 mb-2">{uc.title}</h3>
                          <ul className="space-y-1 mb-2">
                            {uc.items.map((item, i) => (
                              <li key={i} className="flex items-start">
                                <CheckCircle className="h-3 w-3 text-green-500 mr-2 mt-0.5 shrink-0" />
                                <span className="text-gray-700 text-xs leading-tight">{item}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="text-xs text-gray-500 font-medium">{uc.kpi}</div>
                        </div>
                      ))}
                    </div>
                    {/* Zweite Instanz für nahtlose Schleife */}
                    <div className="flex shrink-0 gap-4 pr-4">
                      {rowData.map((uc, idx) => (
                        <div key={`${rowIndex}-dup-${idx}`} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 w-64 shrink-0">
                          <h3 className="text-sm font-bold text-gray-900 mb-2">{uc.title}</h3>
                          <ul className="space-y-1 mb-2">
                            {uc.items.map((item, i) => (
                              <li key={i} className="flex items-start">
                                <CheckCircle className="h-3 w-3 text-green-500 mr-2 mt-0.5 shrink-0" />
                                <span className="text-gray-700 text-xs leading-tight">{item}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="text-xs text-gray-500 font-medium">{uc.kpi}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>


        </div>
      </section>

      {/* Pricing Section */}
      <section id="preise-section" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Transparente <span className="gradient-text">Preise</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Faire Preismodelle ohne versteckte Kosten – wählen Sie das Paket, das zu Ihrem Gesprächsvolumen passt
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[
              {
                name: "Starter",
                minutes: "3.000",
                hours: "50",
                price: "300",
                pricePerMinute: "10",
                features: [
                  "3.000 Minuten Gesprächszeit",
                  "Telefonnummer inklusive",
                  "24/7 Support",
                  "Individuelle API-Integration",
                  "DSGVO-konforme Verarbeitung"
                ],
                popular: false
              },
              {
                name: "Professional",
                minutes: "6.000",
                hours: "100",
                price: "500",
                pricePerMinute: "8,3",
                features: [
                  "6.000 Minuten Gesprächszeit",
                  "Telefonnummer inklusive",
                  "24/7 Premium Support",
                  "Erweiterte API-Integration",
                  "DSGVO-konforme Verarbeitung",
                  "Prioritäts-Support"
                ],
                popular: true
              },
              {
                name: "Enterprise",
                minutes: "10.000",
                hours: "166",
                price: "750",
                pricePerMinute: "7,5",
                features: [
                  "10.000 Minuten Gesprächszeit",
                  "Telefonnummer inklusive",
                  "24/7 VIP Support",
                  "Vollständige API-Integration",
                  "DSGVO-konforme Verarbeitung",
                  "Dedicated Account Manager",
                  "Custom Features"
                ],
                popular: false
              }
            ].map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`relative bg-white p-8 rounded-2xl shadow-lg border-2 ${
                  plan.popular 
                    ? 'border-primary-500 ring-4 ring-primary-100' 
                    : 'border-gray-200 hover:border-primary-300'
                } transition-all duration-300`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                      Beliebtester Plan
                    </span>
                  </div>
                )}
                
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="text-5xl font-bold text-primary-600 mb-2">
                    €{plan.price}
                    <span className="text-lg text-gray-500 font-normal">/Monat</span>
                  </div>
                  <div className="text-gray-600">
                    {plan.minutes} Min. ({plan.hours}h) • {plan.pricePerMinute}ct/Min.
                  </div>
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={scrollToCalendar}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Plan wählen
                </button>
              </motion.div>
            ))}
          </div>

          {/* Pay-as-you-go Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="bg-gradient-to-r from-blue-50 to-indigo-50 p-8 rounded-2xl border border-blue-200"
          >
            <div className="text-center">
              <h4 className="text-2xl font-bold text-gray-900 mb-4">
                Flexible Abrechnung bei Überschreitung
              </h4>
              <p className="text-lg text-gray-700 mb-6">
                Sollten Sie Ihr monatliches Kontingent überschreiten, rechnen wir transparent nach dem 
                <span className="font-semibold text-primary-600"> Pay-as-you-go Prinzip</span> ab:
              </p>
              <div className="inline-flex items-center bg-white px-8 py-4 rounded-xl shadow-sm border border-blue-200">
                <div className="text-3xl font-bold text-primary-600 mr-4">10ct</div>
                <div className="text-left">
                  <div className="font-semibold text-gray-900">pro zusätzliche Minute</div>
                  <div className="text-sm text-gray-600">Keine Mindestabnahme</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Zusatzinfo */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <div className="bg-white p-6 rounded-xl shadow-sm max-w-3xl mx-auto">
              <h5 className="font-semibold text-gray-900 mb-3">Was ist inklusive?</h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
                <div className="flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Keine Einrichtungskosten</span>
                </div>
                <div className="flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Keine Mindestlaufzeit</span>
                </div>
                <div className="flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  <span>Monatlich kündbar</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-primary-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-4 md:mb-6">
              Ihre Vorteile auf einen Blick
            </h2>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {[
              { 
                title: "Kosteneinsparung", 
                value: "85%", 
                desc: "Weniger Personal für Telefondienst nötig" 
              },
              { 
                title: "Mehr Buchungen", 
                value: "+30%", 
                desc: "Nie wieder verpasste Reservierungen" 
              },
              { 
                title: "Kundenzufriedenheit", 
                value: "98%", 
                desc: "Sofortige, professionelle Antworten" 
              },
              { 
                title: "Zeitersparnis", 
                value: "8h/Tag", 
                desc: "Personal kann sich auf Kerngeschäft konzentrieren" 
              },
              { 
                title: "Verfügbarkeit", 
                value: "24/7", 
                desc: "Auch nachts und an Feiertagen erreichbar" 
              },
              { 
                title: "Fehlerreduzierung", 
                value: "95%", 
                desc: "Weniger menschliche Fehler bei Buchungen" 
              }
            ].map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white/10 backdrop-blur-sm p-6 rounded-xl border border-white/20"
              >
                <div className="text-2xl sm:text-3xl font-bold text-accent-500 mb-1 sm:mb-2">{benefit.value}</div>
                <h3 className="text-sm sm:text-base md:text-xl font-semibold text-white mb-1 sm:mb-2">{benefit.title}</h3>
                <p className="text-xs sm:text-sm text-primary-100">{benefit.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Was unsere Kunden sagen
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Unternehmen verschiedenster Branchen vertrauen bereits auf unsere Voice-Agent-Lösungen
            </p>
          </motion.div>

          {/* Testimonials Carousel - Neu erstellt */}
          <div className="relative overflow-hidden w-full">
            <div 
              className="flex animate-marquee"
              style={{ '--marquee-duration': '40s' } as React.CSSProperties}
            >
              {/* Erste vollständige Instanz der Testimonials */}
              <div className="flex shrink-0 gap-6 pr-6">
                {[
                  {
                    name: "Dr. Sarah Zimmermann",
                    company: "Zahnarztpraxis Zimmermann",
                    industry: "Healthcare",
                    text: "Terminausfälle reduziert um 65%. Die automatischen Erinnerungen sind Gold wert.",
                    rating: 5,
                    metric: "-65% Ausfälle"
                  },
                  {
                    name: "Michael Weber",
                    company: "Weber Immobilien",
                    industry: "Immobilien", 
                    text: "Rund um die Uhr professionelle Bearbeitung. Conversion um 45% gestiegen.",
                    rating: 5,
                    metric: "+45% Conversion"
                  },
                  {
                    name: "Lisa Hoffmann",
                    company: "Ristorante Milano",
                    industry: "Gastronomie",
                    text: "40% mehr Reservierungen seit KI-Einführung. Nimmt uns viel Arbeit ab!",
                    rating: 5,
                    metric: "+40% Buchungen"
                  },
                  {
                    name: "Thomas Schneider",
                    company: "Kanzlei Schneider & Partner",
                    industry: "Rechtsberatung",
                    text: "Mandantenanfragen strukturiert erfasst. Spart täglich 4 Stunden Aufwand.",
                    rating: 5,
                    metric: "4h/Tag gespart"
                  },
                  {
                    name: "Anna Klein",
                    company: "Fitness First München",
                    industry: "Fitness",
                    text: "Mitgliederanfragen laufen automatisch. Team kann sich aufs Training konzentrieren.", 
                    rating: 5,
                    metric: "Vollautomatisch"
                  },
                  {
                    name: "Robert Fischer",
                    company: "Elektro Fischer GmbH",
                    industry: "Handwerk",
                    text: "Notfälle sofort priorisiert und weitergeleitet. Kundenservice auf neuem Level!",
                    rating: 5,
                    metric: "24/7 Service"
                  },
                  {
                    name: "Julia Hartmann",
                    company: "Boutique Elegance",
                    industry: "Retail",
                    text: "Kundenanfragen auch nachts bearbeitet. Umsatz um 30% gestiegen.",
                    rating: 5,
                    metric: "+30% Umsatz"
                  },
                  {
                    name: "Mark Schulze",
                    company: "AutoHaus Schulze",
                    industry: "Automotive",
                    text: "Werkstattermine automatisch koordiniert. Keine Doppelbuchungen mehr.",
                    rating: 5,
                    metric: "0% Konflikte"
                  },
                  {
                    name: "Carmen Rodriguez",
                    company: "Hotel Zentral",
                    industry: "Hospitality",
                    text: "Buchungsanfragen in 8 Sprachen bearbeitet. Internationale Gäste begeistert.",
                    rating: 5,
                    metric: "8 Sprachen"
              }
            ].map((testimonial, index) => (
                  <div key={`testimonial-${index}`} className="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-100 w-80 md:w-96 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex">
                  {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                      <div className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                        {testimonial.industry}
                </div>
          </div>
                    <p className="text-gray-600 mb-3 text-sm leading-relaxed">
                      "{testimonial.text}"
                    </p>
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 text-sm">{testimonial.name}</div>
                          <div className="text-xs text-gray-500">{testimonial.company}</div>
                  </div>
                        <div className="text-right ml-3">
                          <div className="text-sm font-bold text-green-600">{testimonial.metric}</div>
                          <div className="text-xs text-gray-500">Erfolg</div>
                  </div>
                    </div>
                    </div>
                  </div>
                ))}
                </div>
              {/* Zweite Instanz für nahtlose Schleife */}
              <div className="flex shrink-0 gap-6 pr-6">
                {[
                  {
                    name: "Dr. Sarah Zimmermann",
                    company: "Zahnarztpraxis Zimmermann",
                    industry: "Healthcare",
                    text: "Terminausfälle reduziert um 65%. Die automatischen Erinnerungen sind Gold wert.",
                    rating: 5,
                    metric: "-65% Ausfälle"
                  },
                  {
                    name: "Michael Weber",
                    company: "Weber Immobilien",
                    industry: "Immobilien", 
                    text: "Rund um die Uhr professionelle Bearbeitung. Conversion um 45% gestiegen.",
                    rating: 5,
                    metric: "+45% Conversion"
                  },
                  {
                    name: "Lisa Hoffmann",
                    company: "Ristorante Milano",
                    industry: "Gastronomie",
                    text: "40% mehr Reservierungen seit KI-Einführung. Nimmt uns viel Arbeit ab!",
                    rating: 5,
                    metric: "+40% Buchungen"
                  },
                  {
                    name: "Thomas Schneider",
                    company: "Kanzlei Schneider & Partner",
                    industry: "Rechtsberatung",
                    text: "Mandantenanfragen strukturiert erfasst. Spart täglich 4 Stunden Aufwand.",
                    rating: 5,
                    metric: "4h/Tag gespart"
                  },
                  {
                    name: "Anna Klein",
                    company: "Fitness First München",
                    industry: "Fitness",
                    text: "Mitgliederanfragen laufen automatisch. Team kann sich aufs Training konzentrieren.", 
                    rating: 5,
                    metric: "Vollautomatisch"
                  },
                  {
                    name: "Robert Fischer",
                    company: "Elektro Fischer GmbH",
                    industry: "Handwerk",
                    text: "Notfälle sofort priorisiert und weitergeleitet. Kundenservice auf neuem Level!",
                    rating: 5,
                    metric: "24/7 Service"
                  },
                  {
                    name: "Julia Hartmann",
                    company: "Boutique Elegance",
                    industry: "Retail",
                    text: "Kundenanfragen auch nachts bearbeitet. Umsatz um 30% gestiegen.",
                    rating: 5,
                    metric: "+30% Umsatz"
                  },
                  {
                    name: "Mark Schulze",
                    company: "AutoHaus Schulze",
                    industry: "Automotive",
                    text: "Werkstattermine automatisch koordiniert. Keine Doppelbuchungen mehr.",
                    rating: 5,
                    metric: "0% Konflikte"
                  },
                  {
                    name: "Carmen Rodriguez",
                    company: "Hotel Zentral",
                    industry: "Hospitality",
                    text: "Buchungsanfragen in 8 Sprachen bearbeitet. Internationale Gäste begeistert.",
                    rating: 5,
                    metric: "8 Sprachen"
                  }
                ].map((testimonial, index) => (
                  <div key={`testimonial-dup-${index}`} className="bg-white p-4 md:p-6 rounded-xl shadow-lg border border-gray-100 w-80 md:w-96 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 text-yellow-400 fill-current" />
                        ))}
                      </div>
                      <div className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                        {testimonial.industry}
                    </div>
                  </div>
                    <p className="text-gray-600 mb-3 text-sm leading-relaxed">
                      "{testimonial.text}"
                    </p>
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 text-sm">{testimonial.name}</div>
                          <div className="text-xs text-gray-500">{testimonial.company}</div>
                </div>
                        <div className="text-right ml-3">
                          <div className="text-sm font-bold text-green-600">{testimonial.metric}</div>
                          <div className="text-xs text-gray-500">Erfolg</div>
                        </div>
                          </div>
                          </div>
                        </div>
                      ))}
                    </div>
                      </div>
          </div>
        </div>
      </section>


      {/* Calendar Section - NOW AFTER TESTIMONIALS */}
      <section id="calendar-section" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Buchen Sie Ihren <span className="gradient-text">Beratungstermin</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Wählen Sie einfach einen verfügbaren Termin aus unserem Kalender. Wir kontaktieren Sie zur vereinbarten Zeit.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            {renderWeekCalendar()}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="mt-8 text-center"
          >
            <div className="bg-white p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
              <h4 className="font-semibold text-gray-900 mb-4">Unsere Sprechzeiten:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <div className="font-medium text-primary-600">Montag - Freitag</div>
                  <div>07:00 - 15:00 Uhr</div>
                </div>
                <div>
                  <div className="font-medium text-primary-600">Samstag</div>
                  <div>07:00 - 13:00 Uhr</div>
                </div>
                <div>
                  <div className="font-medium text-gray-400">Sonntag</div>
                  <div>Geschlossen</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section - SEO-optimiert & Expandable (VOR CTA) */}
      <section id="faq-section" className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">Häufige Fragen</h2>
            <p className="text-lg text-gray-600">Alles was Sie über Enterprise Voice Agents wissen müssen</p>
          </motion.div>

          <div className="space-y-4">
            {[
              { q: 'Was ist ein KI‑Voice Agent und wie funktioniert er?', a: 'Ein KI‑Voice Agent führt natürliche Telefongespräche, versteht Anliegen in Echtzeit und führt Prozesse über Schnittstellen aus (z. B. Terminbuchung, CRM‑Einträge, Weiterleitung). Er bleibt kontextbewusst über mehrere Gesprächsschritte und passt Tonfall sowie Sprechtempo an.' },
              { q: 'Welche Vorteile bieten Voice Agents für Unternehmen?', a: '24/7‑Erreichbarkeit, konstant hohe Servicequalität, drastische Entlastung des Teams bei Routineanfragen, höhere Conversion durch sofortige Reaktion und messbare Prozessdaten. Typisch amortisiert sich die Investition in 2–3 Monaten.' },
              { q: 'Welche Use‑Cases eignen sich für Voice Agents?', a: 'Terminvereinbarung und Erinnerungen, Hotline‑First‑Level, Lead‑Qualifizierung, Bestellannahme, Zahlungserinnerungen, Status‑Auskunft, Rückruforganisation, Eskalation an das richtige Team inkl. Gesprächskontext.' },
              { q: 'Wie integrieren sich Voice Agents in bestehende Systeme?', a: 'Über Standard‑APIs und Webhooks in CRM, ERP und Ticketsysteme (z. B. Salesforce, HubSpot, Pipedrive, SAP). Daten fließen bidirektional, damit Kundenprofile aktuell sind und Ergebnisse automatisch dokumentiert werden.' },
              { q: 'Sind Voice Agents DSGVO‑konform?', a: 'Ja. Verarbeitung innerhalb der EU, verschlüsselte Übertragung und Speicherung, Rollen‑/Rechtemanagement, Audit‑Logs und Auftragsverarbeitung. Datenflüsse sind transparent und revisionssicher.' },
              { q: 'Wie natürlich klingt die Stimme?', a: 'Sehr natürlich: Intonation, Pausen und Nuancen sind auf Dialog optimiert. Mehr als 30 Stimmen und 24+ Sprachen stehen zur Verfügung; die Stimme bleibt über das Gespräch konsistent und empathisch.' },
              { q: 'Wie schnell ist die Reaktionszeit?', a: 'Antwortlatenzen im Bereich <300 ms für ein flüssiges Gesprächserlebnis – deutlich schneller als herkömmliche IVR‑Systeme.' },
              { q: 'Wie schnell ist ein Voice Agent einsatzbereit?', a: 'Standard‑Projekte starten in 1–2 Wochen. Mit tiefer Integration (CRM/ERP/Shop) planen wir 2–4 Wochen. Wir übernehmen Konzeption, Dialogdesign, Implementierung, Tests und Go‑Live.' },
              { q: 'Brauchen wir technische Vorkenntnisse im Unternehmen?', a: 'Nein. Wir liefern eine schlüsselfertige Lösung mit Dashboard. Betrieb, Monitoring und Optimierung übernehmen wir; Ihr Team nutzt nur die Ergebnisse (z. B. Termine, Leads, Tickets).' },
              { q: 'Unterstützen Voice Agents mehrere Sprachen?', a: 'Ja. 24+ Sprachen mit automatischer Erkennung. Ideal für internationale Kunden oder Regionen mit mehreren Sprachen.' },
              { q: 'Können wir den Voice Agent später erweitern?', a: 'Ja, modular. Neue Funktionen, Workflows und Integrationen lassen sich jederzeit hinzufügen – ohne Vendor‑Lock‑in.' },
              { q: 'Steigern Voice Agents Conversions oder Google‑Signale?', a: 'Ja. 24/7‑Service senkt Absprünge und erhöht Interaktion. Kunden berichten von 25–40% höheren Conversions, da Anfragen sofort bearbeitet werden und keine Wartezeiten entstehen.' }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                viewport={{ once: true }}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-sm md:text-base lg:text-lg font-semibold text-gray-900 pr-4">{item.q}</h3>
                  <div className="flex-shrink-0">
                    {openFaqIndex === idx ? (
                      <ChevronUp className="h-5 w-5 text-blue-600" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </button>
                {openFaqIndex === idx && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="px-6 pb-4"
                  >
                    <p className="text-gray-700 text-xs md:text-sm lg:text-base leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section (direkt unter FAQ) */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Bereit für die Zukunft?
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Starten Sie noch heute und sichern Sie sich Ihren Wettbewerbsvorteil
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={scrollToCalendar}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white text-primary-600 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-colors shadow-lg flex items-center justify-center"
              >
                <Calendar className="mr-2 h-5 w-5" />
                Kostenloses Beratungsgespräch
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="border-2 border-white text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white hover:text-primary-600 transition-colors"
              >
                Live-Demo anfordern
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section - Competitive & Expandable (entfernt, ersetzt durch neue Version oben) */}

      {/* Footer */}
      <footer className="bg-blue-600 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Bot className="h-8 w-8 text-primary-500" />
              <span className="font-bold text-xl">Vocaris AI</span>
            </div>
            <p className="text-gray-400 mb-2">
              Individuelle Voice‑Agents für Unternehmen – entwickelt nach Ihren Prozessen
            </p>
            <p className="text-gray-300 mb-8">
              Kontakt: <a href="mailto:info@vocaris-solutions.de" className="underline">info@vocaris-solutions.de</a>
            </p>
            <div className="flex items-center justify-center space-x-6 mb-6 text-sm">
              <a href="/impressum.html" className="underline">Impressum</a>
              <a href="/agb.html" className="underline">AGB</a>
              <a href="/datenschutz.html" className="underline">Datenschutz</a>
            </div>
            <div className="border-t border-gray-700 pt-8">
              <p className="text-gray-500 text-sm">
                © 2025 Vocaris AI. Alle Rechte vorbehalten.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  {selectedSlot ? 'Termin bestätigen' : 'Beratungstermin buchen'}
                </h3>
                <button
                  onClick={() => {
                    setIsBookingModalOpen(false);
                    setSelectedSlot(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {selectedSlot && (
                <div className="mb-6 p-4 bg-primary-50 rounded-lg">
                  <h4 className="font-semibold text-primary-900 mb-2">Gewählter Termin:</h4>
                  <p className="text-primary-700">
                    <strong>{new Date(selectedSlot.date).toLocaleDateString('de-DE', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</strong>
                  </p>
                  <p className="text-primary-700">
                    <strong>{selectedSlot.time} Uhr</strong>
                  </p>
                </div>
              )}

              {!selectedSlot && (
                <div className="mb-6 p-4 bg-primary-50 rounded-lg">
                  <h4 className="font-semibold text-primary-900 mb-2">Hinweis:</h4>
                  <p className="text-sm text-primary-700">
                    Bitte wählen Sie zuerst einen verfügbaren Termin aus dem Kalender aus.
                  </p>
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Ihr Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Max Mustermann"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail-Adresse *
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="max@beispiel.de"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Bevorzugte Kontaktart *
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="phone"
                        checked={formData.meetingType === 'phone'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Phone className="h-5 w-5 text-primary-600 mr-2" />
                      <span>Telefon</span>
                    </label>
                    
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="zoom"
                        checked={formData.meetingType === 'zoom'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Video className="h-5 w-5 text-blue-600 mr-2" />
                      <span>Zoom</span>
                    </label>
                    
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="teams"
                        checked={formData.meetingType === 'teams'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Monitor className="h-5 w-5 text-purple-600 mr-2" />
                      <span>Microsoft Teams</span>
                    </label>
                  </div>
                </div>

                {formData.meetingType === 'phone' && (
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Telefonnummer *
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="+49 123 456789"
                    />
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={!formData.name || !formData.email || !selectedSlot || (formData.meetingType === 'phone' && !formData.phone)}
                    className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Termin buchen
                  </button>
                </div>
              </form>

              <p className="text-xs text-gray-500 mt-4">
                * Pflichtfelder. <strong>Sie erhalten eine Bestätigungsmail mit den Zugangsdaten</strong> für Ihren Beratungstermin.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
  }
  
  export default App 
