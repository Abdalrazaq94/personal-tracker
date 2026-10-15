// Arabic translations, part 5: prayer statuses (on time / late / Qada / didn't pray) and the monthly budget.
export default {
  // prayers
  Qada: 'قضاء',
  'Didn’t pray': 'لم أصلِّ',
  'Didn’t pray it': 'لم أصلِّها',
  'Prayed in its time': 'صلّيتها في وقتها',
  'Prayed late, still in its time': 'صلّيتها متأخرة، وما زال وقتها',
  'Made up later, after its time': 'قضيتها بعد خروج وقتها',
  'Prayed Qada': 'صلّيتها قضاءً',
  'Not marked': 'لم تُسجَّل',
  '✓ On time': '✓ في وقتها',
  ' · {0} Qada': ' · {0} قضاء',
  ' · {0} not prayed': ' · {0} لم تُصلَّ',
  '{0} ({1}) has passed': 'انتهى وقت {0} ({1})',
  '{0} On time {1} Late {2} Qada {3} Didn’t pray {4} Not marked': '{0} في وقتها {1} متأخرة {2} قضاء {3} لم أصلِّ {4} لم تُسجَّل',
  'Sunrise {0} · Qada = prayed after its time. Tap a chosen answer again to undo.':
    'الشروق {0} · القضاء = الصلاة بعد خروج وقتها. اضغط على الاختيار مرة أخرى للتراجع.',
  'Run the new SQL (014) in Supabase to mark “Didn’t pray”.': 'شغّل ملف SQL الجديد (014) في Supabase لتسجيل «لم أصلِّ».',

  // AI
  'Ask again': 'اسأل مرة أخرى',

  // budget
  'Monthly budget': 'الميزانية الشهرية',
  'How much do you want to spend each month?': 'كم تريد أن تصرف كل شهر؟',
  'Warn me at 80% and when I go over (needs Reminders on)': 'نبّهني عند 80% وعند تجاوزها (يحتاج تشغيل التذكيرات)',
  'Remove budget': 'حذف الميزانية',
  'Set budget': 'حدّد الميزانية',
  'Set how much you want to spend this month. You’ll see what’s left and how much you can spend each day.':
    'حدّد كم تريد أن تصرف هذا الشهر، وسترى المتبقي وكم يمكنك أن تصرف كل يوم.',
  'Run supabase/migrations/015_budget.sql in Supabase first.': 'شغّل أولًا الملف supabase/migrations/015_budget.sql في Supabase.',
  'Where you’d be spending evenly': 'أين ستكون لو صرفت بالتساوي',
  'You can spend': 'يمكنك أن تصرف',
  'a day until the month ends': 'في اليوم حتى نهاية الشهر',
  'At this pace': 'بهذا المعدل',
  'by the end of the month · within budget': 'بنهاية الشهر · ضمن الميزانية',
  '{0} over by the end of the month': 'أكثر بـ {0} بنهاية الشهر',
  'more than today’s share': 'أكثر من حصة اليوم',
  'within today’s share': 'ضمن حصة اليوم',
  'Most of it went on': 'أكثر ما صرفت عليه',
  '{0} days left': 'باقي {0} يوم',
  '{0} left': 'باقي {0}',
  '{0} over budget': 'تجاوزت الميزانية بـ {0}',
  '{0} of {1} spent': 'صرفت {0} من {1}',
  '{0}% spent': 'صرفت {0}%',
  '{0}% of the budget spent': 'صرفت {0}% من الميزانية',
  '{0} left of {1} · about {2} a day': 'باقي {0} من {1} · حوالي {2} في اليوم',
  '{0} over your {1} budget': 'تجاوزت ميزانيتك ({1}) بـ {0}',
  '{0} of {1} · {2} left': '{0} من {1} · باقي {2}',
  '{0} of {1} · {2} over': '{0} من {1} · أكثر بـ {2}',
}
