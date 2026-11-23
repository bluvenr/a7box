/**
 * PDF Toolkit Module Registration
 */
import { FileText, Image as ImageIcon, Combine, LayoutGrid } from 'lucide-react'
import type { A7Module } from '../../core/types'

export const pdfToolkitModule: A7Module = {
  meta: {
    id: 'pdf-toolkit',
    name: 'PDF Toolkit',
    nameI18n: 'modules.pdfToolkit.name',
    description: 'Convert PDF to images, images to PDF, merge, split and manage pages',
    descriptionI18n: 'modules.pdfToolkit.description',
    icon: FileText,
    category: 'file',
    tags: ['pdf', 'convert', 'image', 'merge', 'split', 'rotate', 'extract', 'pdf转图片', '合并', '拆分', '文档'],
    version: '1.0.0',
    enabledByDefault: true,
  },
  commands: [
    {
      id: 'open',
      label: 'PDF Toolkit',
      labelI18n: 'modules.pdfToolkit.commands.open',
      description: 'Open the PDF toolkit',
      descriptionI18n: 'modules.pdfToolkit.commands.openDesc',
      icon: FileText,
      run: async (ctx) => { ctx.navigate('/pdf-toolkit') },
    },
    {
      id: 'to-image',
      label: 'PDF to Image',
      labelI18n: 'modules.pdfToolkit.commands.toImage',
      icon: ImageIcon,
      run: async (ctx) => { ctx.navigate('/pdf-toolkit?tab=to-image') },
    },
    {
      id: 'to-pdf',
      label: 'Image to PDF',
      labelI18n: 'modules.pdfToolkit.commands.toPdf',
      icon: FileText,
      run: async (ctx) => { ctx.navigate('/pdf-toolkit?tab=to-pdf') },
    },
    {
      id: 'merge-split',
      label: 'Merge / Split PDF',
      labelI18n: 'modules.pdfToolkit.commands.mergeSplit',
      icon: Combine,
      run: async (ctx) => { ctx.navigate('/pdf-toolkit?tab=merge-split') },
    },
    {
      id: 'pages',
      label: 'Manage PDF Pages',
      labelI18n: 'modules.pdfToolkit.commands.pages',
      icon: LayoutGrid,
      run: async (ctx) => { ctx.navigate('/pdf-toolkit?tab=pages') },
    },
  ],
  component: () => import('./PdfToolkit'),
}