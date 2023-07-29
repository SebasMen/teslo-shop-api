import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

import { Product, ProductImage } from './entities';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productsImageRepository: Repository<ProductImage>,

    @InjectRepository(ProductImage)
    private readonly dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto) {
    try {
      const { images = [], ...restProduct } = createProductDto;

      const product = this.productsRepository.create({
        ...restProduct,
        images: images.map((image) =>
          this.productsImageRepository.create({ url: image }),
        ),
      });

      await this.productsRepository.save(product);

      return { ...product, images };
    } catch (error) {
      this.handleDbException(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const products = await this.productsRepository.find({
      take: limit,
      skip: offset,
      relations: {
        images: true,
      },
    });

    return products.map((product) => ({
      ...product,
      images: product.images.map((img) => img.url),
    }));
  }

  async findOne(term: string) {
    let product: Product;

    if (isUUID(term)) {
      product = await this.productsRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.productsRepository.createQueryBuilder('prod');
      product = await queryBuilder
        .where(`UPPER(title)=:title or slug= :slug`, {
          title: term.toUpperCase(),
          slug: term.toLowerCase(),
        })
        .leftJoinAndSelect('prod.images', 'prodImages') // Trae las imagenes
        .getOne();
    }

    if (!product) {
      throw new NotFoundException(`Product with id ${term} not found`);
    }

    return product;
  }

  async findOnePlain(term: string) {
    const { images = [], ...rest } = await this.findOne(term);
    return {
      ...rest,
      images: images.map((img) => img.url),
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const { images, ...restProduct } = updateProductDto;

    const product = await this.productsRepository.preload({
      id,
      ...restProduct,
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    // Create Query Runner
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await this.productsRepository.save(product);
      return product;
    } catch (error) {
      this.handleDbException(error);
    }
  }

  async remove(id: string) {
    const product = await this.findOne(id);

    await this.productsRepository.remove(product);
    return { message: 'Product deleted' };
  }

  private handleDbException(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }

    // console.log(error);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
